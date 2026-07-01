import { requireSession } from "@/server/session";
import { AppShell } from "@/components/AppShell";
import { DashboardClient } from "@/components/DashboardClient";

export default async function DashboardPage() {
  const session = await requireSession();
  return (
    <AppShell email={session.user.email}>
      <DashboardClient />
    </AppShell>
  );
}
