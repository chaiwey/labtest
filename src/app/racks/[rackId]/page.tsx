import { requireSession } from "@/server/session";
import { AppShell } from "@/components/AppShell";
import { RackWorkspace } from "@/components/RackWorkspace";

export default async function RackPage({
  params,
}: {
  params: Promise<{ rackId: string }>;
}) {
  const session = await requireSession();
  const { rackId } = await params;
  return (
    <AppShell email={session.user.email}>
      <RackWorkspace rackId={rackId} />
    </AppShell>
  );
}
