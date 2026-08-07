import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/auth";
import { createFirstAccount } from "@/app/actions";
import { AuthCard } from "@/components/auth-card";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await needsSetup())) redirect("/login");

  return (
    <AuthCard
      title="Set up your Nabu"
      subtitle="This is your own instance, running on your own infrastructure. Create the account you'll sign in with."
      submitLabel="Create account"
      action={createFirstAccount}
      footer={
        <span>
          Your data stays on this server. Nothing is sent to&nbsp;us.
        </span>
      }
    >
      <div className="field">
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="input"
          placeholder="you@example.com"
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="input"
          placeholder="At least 8 characters"
        />
        <p className="hint">
          There is no password reset email — this instance has no mail server. Store this somewhere
          safe.
        </p>
      </div>
    </AuthCard>
  );
}
