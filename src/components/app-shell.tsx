"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, initials } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOutAction } from "@/app/actions/auth";
import type { Profile } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
}

/** Sidebar links for a project. */
export const PROJECT_NAV: NavItem[] = [
  { href: "", label: "Overview", icon: "\u{1F4CA}" },
  { href: "/architecture", label: "Architecture", icon: "\u{1F5A5}" },
  { href: "/api", label: "Web API", icon: "\u{1F517}" },
  { href: "/stack", label: "Tech Stack & Cost", icon: "\u{1F4B0}" },
  { href: "/decisions", label: "Decisions", icon: "\u{1F4DD}" },
  { href: "/review", label: "AI Review", icon: "\u{1F916}" },
  { href: "/docs", label: "Documentation", icon: "\u{1F4E6}" },
  { href: "/settings", label: "Settings", icon: "\u{2699}" },
];

export function AppShell({
  profile,
  project,
  children,
}: {
  profile: Profile;
  project?: { id: string; name: string; slug: string; status: string } | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Storing the pathname the drawer was opened for closes it on navigation
  // without an effect: the drawer is only "open" while the route is unchanged.
  const [openedAt, setOpenedAt] = React.useState<string | null>(null);
  const mobileOpen = openedAt === pathname;

  const openMobile = () => setOpenedAt(pathname);
  const closeMobile = () => setOpenedAt(null);

  const isActive = (item: NavItem) => {
    if (!project) return false;
    const full = `/projects/${project.id}${item.href}`;
    return item.exact || item.href === ""
      ? pathname === full
      : pathname === full || pathname.startsWith(`${full}/`);
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-border bg-sidebar transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
          <Link href="/dashboard" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[11px] text-primary-foreground">
              AI
            </span>
            <span className="text-sm">System Architect</span>
          </Link>
        </div>

        {project ? (
          <div className="border-b border-border px-4 py-3">
            <Link
              href={`/projects/${project.id}`}
              className="block truncate text-sm font-medium transition-colors hover:text-primary"
            >
              {project.name}
            </Link>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {project.status}
              </span>
              <Link
                href="/dashboard"
                className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              >
                switch
              </Link>
            </div>
          </div>
        ) : (
          <div className="border-b border-border px-4 py-3">
            <span className="text-xs font-medium text-muted-foreground">Workspace</span>
          </div>
        )}

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
          {project
            ? PROJECT_NAV.map((item) => {
                const full = `/projects/${project.id}${item.href}`;
                const active = isActive(item);
                return (
                  <Link
                    key={item.href || "overview"}
                    href={full}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                      active
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <span className="w-4 text-center text-xs">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })
            : [
                { href: "/dashboard", label: "Projects", icon: "\u{1F4E6}" },
                { href: "/settings", label: "Account", icon: "\u{2699}" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    pathname === item.href
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <span className="w-4 text-center text-xs">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
        </nav>

        <div className="border-t border-border p-2.5">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[10px] font-semibold text-primary"
              title={profile.email}
            >
              {initials(profile.full_name, profile.email)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{profile.full_name ?? "Unnamed"}</p>
              <p className="truncate text-[10px] text-muted-foreground">{profile.email}</p>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                title="Sign out"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
          </div>
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-[10px] text-muted-foreground">Role: {profile.role}</span>
            <ThemeToggle className="h-7 w-7" />
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={closeMobile}
          aria-hidden
        />
      ) : null}

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md lg:hidden">
          <button
            onClick={mobileOpen ? closeMobile : openMobile}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
            aria-label="Toggle navigation"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
            </svg>
          </button>
          <span className="text-sm font-medium">
            {project ? project.name : "AI System Architect"}
          </span>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border bg-card/40 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-8">
      <div className="min-w-0 space-y-1">
        {breadcrumb}
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
