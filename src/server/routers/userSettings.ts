import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

const fieldType = z.enum(["text", "number", "date", "enum"]);

export const userSettingsRouter = router({
  // Account + voice settings for the signed-in user.
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true, confirmationEnabled: true },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    return user;
  }),

  setConfirmation: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.user.update({
        where: { id: ctx.userId },
        data: { confirmationEnabled: input.enabled },
      });
      return { confirmationEnabled: input.enabled };
    }),

  // ----- Default fields (template applied to NEW projects only) -----

  listDefaultFields: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.userDefaultField.findMany({
      where: { userId: ctx.userId },
      orderBy: { displayOrder: "asc" },
    });
  }),

  createDefaultField: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(80),
        type: fieldType.default("text"),
        options: z.array(z.string().trim().min(1)).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const last = await ctx.prisma.userDefaultField.findFirst({
        where: { userId: ctx.userId },
        orderBy: { displayOrder: "desc" },
        select: { displayOrder: true },
      });
      return ctx.prisma.userDefaultField.create({
        data: {
          userId: ctx.userId,
          name: input.name,
          type: input.type,
          options: input.options,
          displayOrder: (last?.displayOrder ?? -1) + 1,
        },
      });
    }),

  updateDefaultField: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(80).optional(),
        type: fieldType.optional(),
        options: z.array(z.string().trim().min(1)).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.prisma.userDefaultField.updateMany({
        where: { id: input.id, userId: ctx.userId },
        data: { name: input.name, type: input.type, options: input.options },
      });
      if (count === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: input.id };
    }),

  deleteDefaultField: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.prisma.userDefaultField.deleteMany({
        where: { id: input.id, userId: ctx.userId },
      });
      if (count === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: input.id };
    }),

  reorderDefaultFields: protectedProcedure
    .input(z.object({ orderedIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.$transaction(
        input.orderedIds.map((id, index) =>
          ctx.prisma.userDefaultField.updateMany({
            where: { id, userId: ctx.userId },
            data: { displayOrder: index },
          }),
        ),
      );
      return { ok: true };
    }),
});
