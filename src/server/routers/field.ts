import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import type { Context } from "../trpc";
import { inBounds } from "@/lib/grid";

const fieldType = z.enum(["text", "number", "date", "percent", "enum"]);

/** Verify a project belongs to the signed-in user. */
async function assertOwnedProject(
  ctx: Context & { userId: string },
  projectId: string,
) {
  const project = await ctx.prisma.project.findFirst({
    where: { id: projectId, userId: ctx.userId },
    select: { id: true },
  });
  if (!project) throw new TRPCError({ code: "NOT_FOUND" });
  return project;
}

/** Verify a ProjectField belongs to the user, returning its projectId. */
async function assertOwnedField(
  ctx: Context & { userId: string },
  fieldId: string,
) {
  const field = await ctx.prisma.projectField.findFirst({
    where: { id: fieldId, project: { userId: ctx.userId } },
    select: { id: true, projectId: true },
  });
  if (!field) throw new TRPCError({ code: "NOT_FOUND" });
  return field;
}

/** All slot ids across a project's racks (targets for auto-created values). */
async function projectSlotIds(
  ctx: Context & { userId: string },
  projectId: string,
): Promise<string[]> {
  const slots = await ctx.prisma.slot.findMany({
    where: { rack: { projectId } },
    select: { id: true },
  });
  return slots.map((s) => s.id);
}

export const fieldRouter = router({
  // The active (non-archived) field schema for a project, in display order.
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertOwnedProject(ctx, input.projectId);
      return ctx.prisma.projectField.findMany({
        where: { projectId: input.projectId, archived: false },
        orderBy: { displayOrder: "asc" },
      });
    }),

  // create_project_field(): append a field and back-fill null values on every slot.
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().trim().min(1).max(80),
        type: fieldType.default("text"),
        options: z.array(z.string().trim().min(1)).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnedProject(ctx, input.projectId);
      const last = await ctx.prisma.projectField.findFirst({
        where: { projectId: input.projectId },
        orderBy: { displayOrder: "desc" },
        select: { displayOrder: true },
      });
      const displayOrder = (last?.displayOrder ?? -1) + 1;
      const slotIds = await projectSlotIds(ctx, input.projectId);

      return ctx.prisma.$transaction(async (tx) => {
        const field = await tx.projectField.create({
          data: {
            projectId: input.projectId,
            name: input.name,
            type: input.type,
            options: input.options,
            displayOrder,
          },
        });
        if (slotIds.length > 0) {
          // auto-create null entries for all existing slots
          await tx.slotValue.createMany({
            data: slotIds.map((slotId) => ({ slotId, fieldId: field.id })),
            skipDuplicates: true,
          });
        }
        return field;
      });
    }),

  // update_project_field(): rename / retype / reset enum options.
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(80).optional(),
        type: fieldType.optional(),
        options: z.array(z.string().trim().min(1)).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnedField(ctx, input.id);
      return ctx.prisma.projectField.update({
        where: { id: input.id },
        data: {
          name: input.name,
          type: input.type,
          options: input.options,
        },
      });
    }),

  // delete_project_field(): SOFT delete — archive the field and its values.
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedField(ctx, input.id);
      await ctx.prisma.$transaction([
        ctx.prisma.projectField.update({
          where: { id: input.id },
          data: { archived: true },
        }),
        ctx.prisma.slotValue.updateMany({
          where: { fieldId: input.id },
          data: { archived: true },
        }),
      ]);
      return { id: input.id, archived: true };
    }),

  reorder: protectedProcedure
    .input(z.object({ projectId: z.string(), orderedIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedProject(ctx, input.projectId);
      await ctx.prisma.$transaction(
        input.orderedIds.map((id, index) =>
          ctx.prisma.projectField.updateMany({
            where: { id, projectId: input.projectId },
            data: { displayOrder: index },
          }),
        ),
      );
      return { ok: true };
    }),

  // Read a rack's slot values, keyed for the spreadsheet + detail panel.
  valuesByRack: protectedProcedure
    .input(z.object({ rackId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rack = await ctx.prisma.rack.findFirst({
        where: { id: input.rackId, project: { userId: ctx.userId } },
        select: { id: true },
      });
      if (!rack) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.prisma.slotValue.findMany({
        where: { slot: { rackId: input.rackId }, archived: false },
        select: {
          slotId: true,
          fieldId: true,
          value: true,
          lastModifiedAt: true,
          slot: { select: { row: true, col: true } },
        },
      });
    }),

  // Cell-based setter for the grid/spreadsheet: ensures the slot exists (creating
  // it with an empty label if the cell was previously empty), then sets the value.
  setValueByCell: protectedProcedure
    .input(
      z.object({
        rackId: z.string(),
        row: z.number().int().min(0),
        col: z.number().int().min(0),
        fieldId: z.string(),
        value: z.string().max(1000).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rack = await ctx.prisma.rack.findFirst({
        where: { id: input.rackId, project: { userId: ctx.userId } },
        select: { id: true, rows: true, cols: true, projectId: true },
      });
      if (!rack) throw new TRPCError({ code: "NOT_FOUND" });
      if (!inBounds(rack, { row: input.row, col: input.col })) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Slot is outside the rack." });
      }
      const field = await ctx.prisma.projectField.findFirst({
        where: { id: input.fieldId, projectId: rack.projectId, archived: false },
        select: { id: true },
      });
      if (!field) throw new TRPCError({ code: "NOT_FOUND" });

      const slot = await ctx.prisma.slot.upsert({
        where: { rackId_row_col: { rackId: input.rackId, row: input.row, col: input.col } },
        create: { rackId: input.rackId, row: input.row, col: input.col, label: "" },
        update: {},
        select: { id: true },
      });
      return ctx.prisma.slotValue.upsert({
        where: { slotId_fieldId: { slotId: slot.id, fieldId: input.fieldId } },
        create: {
          slotId: slot.id,
          fieldId: input.fieldId,
          value: input.value,
          lastModifiedBy: ctx.userId,
        },
        update: { value: input.value, lastModifiedBy: ctx.userId, archived: false },
      });
    }),

  // Set/clear a single slot's value for one field (used by both views + voice).
  setValue: protectedProcedure
    .input(
      z.object({
        slotId: z.string(),
        fieldId: z.string(),
        value: z.string().max(1000).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // ownership via the field's project
      const field = await ctx.prisma.projectField.findFirst({
        where: { id: input.fieldId, project: { userId: ctx.userId } },
        select: { id: true },
      });
      if (!field) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.prisma.slotValue.upsert({
        where: { slotId_fieldId: { slotId: input.slotId, fieldId: input.fieldId } },
        create: {
          slotId: input.slotId,
          fieldId: input.fieldId,
          value: input.value,
          lastModifiedBy: ctx.userId,
        },
        update: { value: input.value, lastModifiedBy: ctx.userId, archived: false },
      });
    }),

  // save_project_fields_as_default(): push this project's current fields up to
  // become the user's account-level template (replaces existing defaults).
  saveAsDefault: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedProject(ctx, input.projectId);
      const fields = await ctx.prisma.projectField.findMany({
        where: { projectId: input.projectId, archived: false },
        orderBy: { displayOrder: "asc" },
      });
      await ctx.prisma.$transaction([
        ctx.prisma.userDefaultField.deleteMany({ where: { userId: ctx.userId } }),
        ctx.prisma.userDefaultField.createMany({
          data: fields.map((f, index) => ({
            userId: ctx.userId,
            name: f.name,
            type: f.type,
            options: f.options,
            displayOrder: index,
          })),
        }),
      ]);
      return { count: fields.length };
    }),
});
