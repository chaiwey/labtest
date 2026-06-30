import { requireSession } from "@/server/session";
import { AppHeader } from "@/components/AppHeader";
import { RackWorkspace } from "@/components/RackWorkspace";

export default async function RackPage({
  params,
}: {
  params: Promise<{ rackId: string }>;
}) {
  const session = await requireSession();
  const { rackId } = await params;
  return (
    <>
      <AppHeader email={session.user.email} />
      <RackWorkspace rackId={rackId} />
    </>
  );
}
