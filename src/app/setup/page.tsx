import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import {
  isSupabaseConfigured,
  missingPublicEnv,
  missingSecretEnv,
} from "@/lib/supabase/env";

export const metadata = { title: "Setup required" };

const STEPS = [
  {
    title: "Create the tables",
    body: "Run supabase/schema.sql in the Supabase SQL Editor. It is idempotent, so re-running it is safe. It creates 13 tables, 10 enums, the RLS policies and the 34-row service catalog.",
    code: "supabase/schema.sql",
  },
  {
    title: "Copy the API keys",
    body: "In Supabase go to Project Settings -> API and copy the project URL and the publishable (anon) key.",
    code: "NEXT_PUBLIC_SUPABASE_URL\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  },
  {
    title: "Add the secret key for member invites",
    body: "Only needed for admin operations such as inviting a member by email. Keep it server-side and never prefix it with NEXT_PUBLIC_.",
    code: "SUPABASE_SECRET_KEY",
  },
  {
    title: "Optional: enable AI Review",
    body: "Without a key the AI Review module falls back to a built-in rules analyzer, so the app stays fully usable.",
    code: "OPENAI_API_KEY",
  },
];

export default async function SetupPage() {
  const configured = isSupabaseConfigured();
  const missing = [...missingPublicEnv(), ...missingSecretEnv()];

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_70%)]" />

      <div className="relative w-full max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground">
              AI
            </span>
            <span className="text-sm">System Architect</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${configured ? "bg-emerald-500" : "bg-amber-500"}`}
              aria-hidden
            />
          <h1 className="text-lg font-semibold tracking-tight">
            {configured ? "Setup complete" : "Supabase is not configured"}
          </h1>
          </div>

          {configured ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing is left to configure. The setup steps below are kept for reference.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href="/dashboard"
                  className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:brightness-110"
                >
                  Go to dashboard
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Create an account
                </Link>
              </div>

              <div className="mt-5 rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-xs font-medium">If sign-in is rejected</p>
                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <li>
                    <strong className="text-foreground">Email not confirmed</strong> — open Supabase
                    Dashboard, then Authentication, Users, click your row and choose Confirm email.
                    New accounts need this once.
                  </li>
                  <li>
                    <strong className="text-foreground">Invalid login credentials</strong> — sign up
                    again with the same address; do not create a second account.
                  </li>
                  <li>
                    <strong className="text-foreground">Still reports missing variables</strong> —
                    the deployment predates the variables. Redeploy it.
                  </li>
                </ul>
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                The application shell is running, but it has no database to talk to yet. Add the
                variables below to finish setup.
              </p>

              {missing.length > 0 ? (
                <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                  <p className="text-xs font-medium tracking-wide text-amber-600 uppercase dark:text-amber-400">
                    Missing {missing.length === 1 ? "variable" : "variables"}
                  </p>
                  <ul className="mt-2 space-y-1 font-mono text-xs">
                    {missing.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}

          <ol className="mt-6 space-y-5">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
                  <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted/40 p-2.5 font-mono text-[11px] whitespace-pre-wrap">
                    {step.code}
                  </pre>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-6 text-xs text-muted-foreground">
            Put the values in <code className="font-mono">.env.local</code> for local development
            (copy <code className="font-mono">.env.local.example</code>), or add them to your
            host&apos;s environment settings. The names must match exactly, prefix included.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            On a hosted platform the environment is captured per deployment, so a running
            deployment keeps reporting missing variables until you redeploy. Auth itself
            happens in Server Actions, so no Supabase key is ever sent to the browser.
          </p>
        </div>
      </div>
    </div>
  );
}
