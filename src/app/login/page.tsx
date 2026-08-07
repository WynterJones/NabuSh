import { redirect } from "next/navigation";
import { getCurrentUser, needsSetup } from "@/lib/auth";
import { login } from "@/app/actions";
import { AuthCard } from "@/components/auth-card";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await needsSetup()) redirect("/setup");
  if (await getCurrentUser()) redirect("/inbox");

  return (
    <AuthCard
      title="Sign in to Nabu"
      subtitle="Your agents keep running whether you're here or not. Sign in to read what they've filed."
      submitLabel="Sign in"
      action={login}
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
          autoComplete="current-password"
          className="input"
          placeholder="••••••••"
        />
      </div>
    </AuthCard>
  );
}
