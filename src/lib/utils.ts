/* ------------------------------------------------------------------ */
/*  Class names                                                       */
/* ------------------------------------------------------------------ */

/** Tiny classnames helper. Falsy values are dropped. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/*  Slugs & ids                                                       */
/* ------------------------------------------------------------------ */

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Ensures slug uniqueness by appending -2, -3, ... when needed. */
export function uniqueSlug(base: string, taken: string[]): string {
  const root = slugify(base) || "project";
  if (!taken.includes(root)) return root;
  let n = 2;
  while (taken.includes(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

/** Turns a path template into a valid OpenAPI operationId. */
export function operationIdFromPath(method: string, path: string): string {
  const cleaned = path
    .replace(/[{}]/g, "")
    .split("/")
    .filter(Boolean)
    .map((seg) =>
      /^\d+$/.test(seg)
        ? "ById"
        : seg.replace(/[^a-zA-Z0-9]+(.)?/g, (_, c: string) => (c ? c.toUpperCase() : "")),
    )
    .join("");

  const verb = method.toLowerCase();
  const camel = `${verb}${cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Root"}`;
  return camel.charAt(0).toLowerCase() + camel.slice(1);
}

/* ------------------------------------------------------------------ */
/*  Formatting                                                        */
/* ------------------------------------------------------------------ */

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function formatCurrency(value: number, opts?: { compact?: boolean }): string {
  if (!Number.isFinite(value)) return "$0.00";
  if (opts?.compact && Math.abs(value) >= 1000) {
    return `$${new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value)}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function initials(name: string | null | undefined, email?: string | null): string {
  const source = (name ?? "").trim() || (email ?? "").split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  Actions / results                                                 */
/* ------------------------------------------------------------------ */

export type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
};

export const IDLE: ActionState = { status: "idle", message: "" };

export function actionError(message: string, fieldErrors?: Record<string, string>): ActionState {
  return { status: "error", message, fieldErrors };
}

export function actionSuccess(message: string): ActionState {
  return { status: "success", message };
}

/** Turns a PostgREST error into something safe to show a user. */
export function describeDbError(error: { message: string; code?: string } | null): string {
  if (!error) return "Unknown database error.";
  if (error.code === "42501") return "You do not have permission to perform this action.";
  if (error.code === "23505") return "That value already exists (duplicate entry).";
  if (error.code === "23503") return "Referenced record does not exist or is still referenced.";
  if (error.code === "23514") return "A value failed a database constraint check.";
  return error.message;
}

/* ------------------------------------------------------------------ */
/*  CSV & downloads                                                   */
/* ------------------------------------------------------------------ */

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join(
    "\n",
  );
}

/** Triggers a client-side file download. No-op on the server. */
export function downloadText(filename: string, content: string, mime = "text/plain") {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function parseTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  );
}

export function parseList(input: string): string[] {
  return input
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}\u2026`;
}

/** Coerces anything into a valid UUID, or null. Guards against bad URL params. */
export function asUuid(value: string | undefined | null): string | null {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

/**
 * Turns a ZodError into a single message plus a `fieldErrors` map shaped for
 * ActionState, so server actions report the first problem consistently.
 */
export function firstIssue(error: {
  issues: { message: string; path: PropertyKey[] }[];
}): { message: string; field: string } {
  const issue = error.issues[0];
  return {
    message: issue?.message ?? "Invalid input.",
    field: issue?.path.join(".") ?? "",
  };
}

/** Convenience wrapper: build an error ActionState straight from a ZodError. */
export function zodActionError(error: Parameters<typeof firstIssue>[0]): ActionState {
  const { message, field } = firstIssue(error);
  return actionError(message, field ? { [field]: message } : undefined);
}
