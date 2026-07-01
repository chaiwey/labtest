import { requireSession } from "@/server/session";
import { AppShell } from "@/components/AppShell";
import { ProjectClient } from "@/components/ProjectClient";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await requireSession();
  const { projectId } = await params;
  return (
    <AppShell email={session.user.email}>
      <ProjectClient projectId={projectId} />
    </AppShell>
  );
}
