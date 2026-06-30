import { requireSession } from "@/server/session";
import { AppHeader } from "@/components/AppHeader";
import { DashboardClient } from "@/components/DashboardClient";

export default async function DashboardPage() {
  const session = await requireSession();
  return (
    <>
      <AppHeader email={session.user.email} />
      <DashboardClient />
    </>
  );
}
