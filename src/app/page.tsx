import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { getUser } from "@/lib/auth";

const FEATURES = [
  {
    icon: "\u{1F5A5}",
    title: "Architecture designer",
    body: "Drag C4-style components onto a live canvas, wire them together, and record protocol, auth and SLA for every connection. Full version history.",
  },
  {
    icon: "\u{1F517}",
    title: "Web API designer",
    body: "Model REST endpoints with parameters, request bodies and typed responses. Export OpenAPI 3.1, a TypeScript client, cURL commands and a runnable mock server.",
  },
  {
    icon: "\u{1F4B0}",
    title: "Cost model",
    body: "Price an architecture against a catalogue of real cloud services. Hourly, per-request and per-GB units are normalised into a monthly run rate.",
  },
  {
    icon: "\u{1F4DD}",
    title: "Decision records",
    body: "Capture architecture decision records with context, decision, consequences and rejected alternatives. Export as a shareable ADR bundle.",
  },
  {
    icon: "\u{1F916}",
    title: "AI design review",
    body: "Score your design for scalability, reliability and security. Runs a 40-rule static analyser offline, or an LLM reviewer when an API key is configured.",
  },
  {
    icon: "\u{1F4E6}",
    title: "Documentation export",
    body: "Turn your diagrams, API and decisions into Markdown or a paginated PDF you can hand to a stakeholder.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Describe the system",
    body: "Set the goal, scope, actors and constraints. This becomes the context every other module reads from.",
  },
  {
    step: "02",
    title: "Draw the architecture",
    body: "Compose the component canvas and the API surface. The cost model and reviewer read directly from these.",
  },
  {
    step: "03",
    title: "Review and ship",
    body: "Run the design review, fix the findings, then export documentation and an OpenAPI spec for the team.",
  },
];

export default async function LandingPage() {
  const user = await getUser();

  return (
    <div className="min-h-screen bg-background">
      {/* header */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground">
              AI
            </span>
            <span className="hidden sm:inline">System Architect</span>
          </Link>

          <nav className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <Link
                href="/dashboard"
                className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:brightness-110"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:brightness-110"
                >
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-success" />
              Powered by Supabase
            </span>

            <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
              Design the architecture.
              <br />
              <span className="text-gradient">Ship the API.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              One workspace for system diagrams, REST API contracts, infrastructure cost, decision
              records and automated design review. Built for teams that need the diagram and the
              spec to agree with each other.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={user ? "/dashboard" : "/signup"}
                className="inline-flex h-11 items-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110"
              >
                {user ? "Open dashboard" : "Create free account"}
              </Link>
              <a
                href="#features"
                className="inline-flex h-11 items-center rounded-lg border border-border bg-card px-6 text-sm font-medium transition-colors hover:bg-secondary"
              >
                See what it does
              </a>
            </div>
          </div>

          {/* diagram preview */}
          <div className="relative mx-auto mt-16 max-w-4xl">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-2xl sm:p-6">
              <div className="flex items-center gap-1.5 border-b border-border pb-3">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
                <span className="ml-3 font-mono text-[11px] text-muted-foreground">
                  architecture / container view
                </span>
              </div>

              <div className="grid-bg relative mt-4 grid gap-3 overflow-hidden rounded-lg border border-border/60 sm:grid-cols-5">
                {[
                  { label: "Web Client", tone: "bg-sky-500/12 border-sky-500/30 text-sky-600 dark:text-sky-300", col: "sm:col-start-2" },
                  { label: "API Gateway", tone: "bg-amber-500/12 border-amber-500/30 text-amber-600 dark:text-amber-300", col: "sm:col-start-3" },
                  { label: "Order Service", tone: "bg-indigo-500/12 border-indigo-500/30 text-indigo-600 dark:text-indigo-300", col: "sm:col-start-2 sm:row-start-2" },
                  { label: "Event Bus", tone: "bg-teal-500/12 border-teal-500/30 text-teal-600 dark:text-teal-300", col: "sm:col-start-3 sm:row-start-2" },
                  { label: "PostgreSQL", tone: "bg-emerald-500/12 border-emerald-500/30 text-emerald-600 dark:text-emerald-300", col: "sm:col-start-2 sm:row-start-3" },
                  { label: "Redis", tone: "bg-emerald-500/12 border-emerald-500/30 text-emerald-600 dark:text-emerald-300", col: "sm:col-start-4 sm:row-start-2" },
                ].map((n) => (
                  <div
                    key={n.label}
                    className={`${n.col} mx-2 my-2 rounded-lg border px-3 py-2.5 text-center text-[11px] font-medium ${n.tone}`}
                  >
                    {n.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* features */}
      <section id="features" className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight">Everything a design review needs</h2>
            <p className="mt-3 text-muted-foreground">
              Each module reads from the same project record, so the diagram, the API contract and
              the cost estimate never drift apart.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <div className="text-2xl">{f.icon}</div>
                <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* how it works */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.step}>
                <div className="font-mono text-2xl font-semibold text-primary/40">{s.step}</div>
                <h3 className="mt-3 text-sm font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* cta */}
      <section className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-3xl px-5 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Start with your next design</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
            Email and password, no credit card. Your first account becomes the workspace admin.
          </p>
          <Link
            href={user ? "/dashboard" : "/signup"}
            className="mt-8 inline-flex h-11 items-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110"
          >
            {user ? "Go to dashboard" : "Create account"}
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-xs text-muted-foreground sm:flex-row">
          <p>AI System Architect {"\u2014"} architecture and API design workspace</p>
          <p>Built with Next.js, React Flow and Supabase</p>
        </div>
      </footer>
    </div>
  );
}
