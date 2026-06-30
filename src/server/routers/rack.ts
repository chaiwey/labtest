import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

const MAX_DIM = 100;

export const rackRouter = router({
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      // ownership enforced via the project's userId
      return ctx.prisma.rack.findMany({
        where: { projectId: input.projectId, project: { userId: ctx.userId } },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { slots: true } } },
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const rack = await ctx.prisma.rack.findFirst({
        where: { id: input.id, project: { userId: ctx.userId } },
        include: {
          slots: true,
          project: { select: { id: true, name: true } },
        },
      });
      if (!rack) throw new TRPCError({ code: "NOT_FOUND" });
      return rack;
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().trim().min(1).max(120),
        rows: z.number().int().min(1).max(MAX_DIM),
        cols: z.number().int().min(1).max(MAX_DIM),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // verify the project is owned by the user before creating
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.userId },
        select: { id: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.prisma.rack.create({
        data: {
          name: input.name,
          rows: input.rows,
          cols: input.cols,
          projectId: input.projectId,
        },
      });
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().trim().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.prisma.rack.updateMany({
        where: { id: input.id, project: { userId: ctx.userId } },
        data: { name: input.name },
      });
      if (count === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: input.id, name: input.name };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.prisma.rack.deleteMany({
        where: { id: input.id, project: { userId: ctx.userId } },
      });
      if (count === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: input.id };
    }),
});
