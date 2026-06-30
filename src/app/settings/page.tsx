import { requireSession } from "@/server/session";
import { AppHeader } from "@/components/AppHeader";
import { SettingsClient } from "@/components/SettingsClient";

export default async function SettingsPage() {
  const session = await requireSession();
  return (
    <>
      <AppHeader email={session.user.email} />
      <SettingsClient />
    </>
  );
}
