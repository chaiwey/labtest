import { requireSession } from "@/server/session";
import { AppHeader } from "@/components/AppHeader";
import { ProjectClient } from "@/components/ProjectClient";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await requireSession();
  const { projectId } = await params;
  return (
    <>
      <AppHeader email={session.user.email} />
      <ProjectClient projectId={projectId} />
    </>
  );
}
