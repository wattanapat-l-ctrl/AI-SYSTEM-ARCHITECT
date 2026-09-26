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
              {configured ? "Supabase is configured" : "Supabase is not configured"}
            </h1>
          </div>

          <p className="mt-2 text-sm text-muted-foreground">
            {configured
              ? "The required environment variables are present. If anything still fails, restart the dev server so the new values are picked up."
              : "The application shell is running, but it has no database to talk to yet. Add the variables below to finish setup."}
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
            host&apos;s environment settings. Restart the server afterwards.
          </p>
        </div>
      </div>
    </div>
  );
}
