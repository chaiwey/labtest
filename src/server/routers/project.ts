import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

export const projectRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.project.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { racks: true } } },
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.id, userId: ctx.userId },
        include: {
          racks: {
            orderBy: { createdAt: "desc" },
            include: { _count: { select: { slots: true } } },
          },
        },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      return project;
    }),

  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      // Seed the project's field schema from the user's default template.
      const defaults = await ctx.prisma.userDefaultField.findMany({
        where: { userId: ctx.userId },
        orderBy: { displayOrder: "asc" },
      });
      return ctx.prisma.project.create({
        data: {
          name: input.name,
          userId: ctx.userId,
          fields: {
            create: defaults.map((d, index) => ({
              name: d.name,
              type: d.type,
              options: d.options,
              displayOrder: index,
            })),
          },
        },
      });
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().trim().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.prisma.project.updateMany({
        where: { id: input.id, userId: ctx.userId },
        data: { name: input.name },
      });
      if (count === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: input.id, name: input.name };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.prisma.project.deleteMany({
        where: { id: input.id, userId: ctx.userId },
      });
      if (count === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: input.id };
    }),
});
