"use client";

/**
 * Reports whether the browser actually received the Supabase key.
 *
 * Next.js inlines NEXT_PUBLIC_* values into the client bundle at BUILD time and
 * freezes them. Adding the variable to the host after a build therefore has no
 * effect until a redeploy, which produces a confusing state: the server reports
 * "configured" while the browser has no key and sign-in cannot work.
 *
 * This component closes that gap by comparing what the server saw against what
 * actually made it into the bundle.
 */
export function SupabaseClientStatus({ serverConfigured }: { serverConfigured: boolean }) {
  // Reading this through process.env is what makes the value get inlined.
  const inlinedKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  const inlinedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const browserHasKey = inlinedKey.trim() !== "" && inlinedUrl.trim() !== "";

  if (!serverConfigured) {
    return (
      <p className="text-xs text-muted-foreground">
        The server has not received the Supabase variables yet.
      </p>
    );
  }

  if (!browserHasKey) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-xs font-medium tracking-wide text-amber-600 uppercase dark:text-amber-400">
          Redeploy required
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          The server can see the Supabase variables, but this browser received an empty
          value. Next.js freezes <code className="font-mono">NEXT_PUBLIC_*</code> variables
          into the bundle at build time, so the deployment has to be rebuilt after the
          variables are added. Use <strong>Redeploy</strong> on the latest deployment, then
          hard-refresh this page.
        </p>
      </div>
    );
  }

  return (
    <p className="text-xs text-muted-foreground">
      The server and this browser both have the Supabase configuration.
    </p>
  );
}
