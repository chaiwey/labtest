import { router } from "../trpc";
import { projectRouter } from "./project";
import { rackRouter } from "./rack";
import { slotRouter } from "./slot";
import { fieldRouter } from "./field";
import { userSettingsRouter } from "./userSettings";

export const appRouter = router({
  project: projectRouter,
  rack: rackRouter,
  slot: slotRouter,
  field: fieldRouter,
  userSettings: userSettingsRouter,
});

export type AppRouter = typeof appRouter;
