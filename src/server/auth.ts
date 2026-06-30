import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { Resend } from "resend";
import { prisma } from "./db";

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM ?? "LabTest <onboarding@resend.dev>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  pages: { signIn: "/signin", verifyRequest: "/signin?check=1" },
  providers: [
    EmailProvider({
      from: emailFrom,
      // Custom sender: deliver the magic link via Resend. In development we also
      // log the URL so you can sign in without inbox access.
      async sendVerificationRequest({ identifier: email, url }) {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.log(`\n🔑 Magic link for ${email}:\n${url}\n`);
        }
        if (!resend) {
          if (process.env.NODE_ENV === "production") {
            throw new Error("RESEND_API_KEY is required to send sign-in emails.");
          }
          return; // dev without a key: rely on the logged URL
        }
        const { error } = await resend.emails.send({
          from: emailFrom,
          to: email,
          subject: "Sign in to LabTest",
          html: magicLinkEmail(url),
          text: `Sign in to LabTest:\n${url}\n\nIf you did not request this, ignore this email.`,
        });
        if (error) {
          throw new Error(`Failed to send magic-link email: ${error.message}`);
        }
      },
    }),
  ],
  callbacks: {
    // Expose the user id on the session for client/server use.
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
};

function magicLinkEmail(url: string): string {
  return `
  <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="color:#111">Sign in to LabTest</h2>
    <p style="color:#444">Click the button below to sign in. This link expires soon.</p>
    <p style="margin:24px 0">
      <a href="${url}" style="background:#3b82f6;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Sign in</a>
    </p>
    <p style="color:#888;font-size:13px">If you did not request this, you can safely ignore this email.</p>
  </div>`;
}
