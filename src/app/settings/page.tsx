import { requireSession } from "@/server/session";
import { AppShell } from "@/components/AppShell";
import { SettingsClient } from "@/components/SettingsClient";

export default async function SettingsPage() {
  const session = await requireSession();
  return (
    <AppShell email={session.user.email}>
      <SettingsClient />
    </AppShell>
  );
}
