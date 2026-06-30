import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./auth";

/** Server-component guard: returns the session or redirects to /signin. */
export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/signin");
  return session;
}
