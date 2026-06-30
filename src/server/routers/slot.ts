import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { inBounds } from "@/lib/grid";
import type { Context } from "../trpc";

/** Load a rack only if it belongs to the signed-in user. */
async function getOwnedRack(
  ctx: Context & { userId: string },
  rackId: string,
) {
  const rack = await ctx.prisma.rack.findFirst({
    where: { id: rackId, project: { userId: ctx.userId } },
    select: { id: true, rows: true, cols: true },
  });
  if (!rack) throw new TRPCError({ code: "NOT_FOUND" });
  return rack;
}

const cellInput = z.object({
  rackId: z.string(),
  row: z.number().int().min(0),
  col: z.number().int().min(0),
});

export const slotRouter = router({
  listByRack: protectedProcedure
    .input(z.object({ rackId: z.string() }))
    .query(async ({ ctx, input }) => {
      await getOwnedRack(ctx, input.rackId);
      return ctx.prisma.slot.findMany({ where: { rackId: input.rackId } });
    }),

  setLabel: protectedProcedure
    .input(cellInput.extend({ label: z.string().trim().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const rack = await getOwnedRack(ctx, input.rackId);
      if (!inBounds(rack, { row: input.row, col: input.col })) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Slot is outside the rack dimensions.",
        });
      }
      return ctx.prisma.slot.upsert({
        where: {
          rackId_row_col: {
            rackId: input.rackId,
            row: input.row,
            col: input.col,
          },
        },
        create: {
          rackId: input.rackId,
          row: input.row,
          col: input.col,
          label: input.label,
        },
        update: { label: input.label },
      });
    }),

  clear: protectedProcedure
    .input(cellInput)
    .mutation(async ({ ctx, input }) => {
      await getOwnedRack(ctx, input.rackId);
      await ctx.prisma.slot.deleteMany({
        where: { rackId: input.rackId, row: input.row, col: input.col },
      });
      return { ok: true };
    }),

  // Used by the voice "what is in slot X" query.
  getByPosition: protectedProcedure
    .input(cellInput)
    .query(async ({ ctx, input }) => {
      await getOwnedRack(ctx, input.rackId);
      const slot = await ctx.prisma.slot.findUnique({
        where: {
          rackId_row_col: {
            rackId: input.rackId,
            row: input.row,
            col: input.col,
          },
        },
      });
      return { label: slot?.label ?? null };
    }),
});
