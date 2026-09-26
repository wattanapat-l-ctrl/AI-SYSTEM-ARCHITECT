import type {
  AdrStatus,
  ApiAuthType,
  DiagramKind,
  HttpMethod,
  NodeKind,
  NodeLayer,
  ProjectStatus,
  ReviewSeverity,
  ServiceCategory,
} from "./types";

/* ------------------------------------------------------------------ */
/*  Node palette                                                      */
/* ------------------------------------------------------------------ */

export interface NodeKindMeta {
  kind: NodeKind;
  label: string;
  layer: NodeLayer;
  icon: string;
  /** tailwind-compatible colour tokens (no dynamic class strings) */
  tone: string;
  description: string;
  defaultLabel: string;
  /** heuristics for the architecture linter */
  tags: string[];
}

export const NODE_KINDS: NodeKindMeta[] = [
  {
    kind: "person",
    label: "Person",
    layer: "external",
    icon: "\u{1F464}",
    tone: "violet",
    description: "A human actor who interacts with the system.",
    defaultLabel: "User",
    tags: ["actor"],
  },
  {
    kind: "client_web",
    label: "Web Client",
    layer: "presentation",
    icon: "\u{1F310}",
    tone: "sky",
    description: "Browser based front end.",
    defaultLabel: "Web App",
    tags: ["frontend", "edge"],
  },
  {
    kind: "client_mobile",
    label: "Mobile Client",
    layer: "presentation",
    icon: "\u{1F4F1}",
    tone: "sky",
    description: "iOS / Android application.",
    defaultLabel: "Mobile App",
    tags: ["frontend", "edge"],
  },
  {
    kind: "client_cli",
    label: "CLI Client",
    layer: "presentation",
    icon: "\u{1F5A5}",
    tone: "slate",
    description: "Command line interface.",
    defaultLabel: "CLI",
    tags: ["frontend"],
  },
  {
    kind: "gateway",
    label: "API Gateway",
    layer: "infrastructure",
    icon: "\u{1F6AA}",
    tone: "amber",
    description: "Entry point that terminates TLS, routes and rate limits.",
    defaultLabel: "API Gateway",
    tags: ["entrypoint", "network", "edge"],
  },
  {
    kind: "service",
    label: "Service",
    layer: "application",
    icon: "\u{1F9F9}",
    tone: "indigo",
    description: "Long running backend service.",
    defaultLabel: "Service",
    tags: ["backend", "stateful"],
  },
  {
    kind: "serverless",
    label: "Serverless Function",
    layer: "application",
    icon: "\u{26A1}",
    tone: "indigo",
    description: "Function-as-a-service unit.",
    defaultLabel: "Function",
    tags: ["backend", "stateless"],
  },
  {
    kind: "worker",
    label: "Background Worker",
    layer: "application",
    icon: "\u{1F504}",
    tone: "teal",
    description: "Asynchronous consumer or scheduled job.",
    defaultLabel: "Worker",
    tags: ["backend", "async"],
  },
  {
    kind: "queue",
    label: "Message Queue",
    layer: "infrastructure",
    icon: "\u{1F4E5}",
    tone: "teal",
    description: "Buffer decoupling producers from consumers.",
    defaultLabel: "Queue",
    tags: ["messaging", "async", "decoupling"],
  },
  {
    kind: "database",
    label: "Database",
    layer: "data",
    icon: "\u{1F5C4}",
    tone: "emerald",
    description: "Relational / document store of record.",
    defaultLabel: "Database",
    tags: ["database", "stateful", "persistence"],
  },
  {
    kind: "cache",
    label: "Cache",
    layer: "data",
    icon: "\u{1F50B}",
    tone: "emerald",
    description: "Low latency in-memory store.",
    defaultLabel: "Cache",
    tags: ["cache", "performance"],
  },
  {
    kind: "object_storage",
    label: "Object Storage",
    layer: "data",
    icon: "\u{1F5C2}",
    tone: "emerald",
    description: "Blob / file storage.",
    defaultLabel: "Object Storage",
    tags: ["storage", "persistence"],
  },
  {
    kind: "search",
    label: "Search Index",
    layer: "data",
    icon: "\u{1F50D}",
    tone: "emerald",
    description: "Full-text or vector search engine.",
    defaultLabel: "Search Index",
    tags: ["search", "query"],
  },
  {
    kind: "container",
    label: "Container / Orchestrator",
    layer: "infrastructure",
    icon: "\u{1F433}",
    tone: "orange",
    description: "Docker or Kubernetes workload.",
    defaultLabel: "Kubernetes",
    tags: ["runtime", "orchestration"],
  },
  {
    kind: "vm",
    label: "Virtual Machine",
    layer: "infrastructure",
    icon: "\u{1F5A5}",
    tone: "orange",
    description: "Compute instance or server.",
    defaultLabel: "VM",
    tags: ["compute", "runtime"],
  },
  {
    kind: "cicd",
    label: "CI/CD",
    layer: "infrastructure",
    icon: "\u{1F504}",
    tone: "orange",
    description: "Build and delivery pipeline.",
    defaultLabel: "CI/CD Pipeline",
    tags: ["delivery", "cicd"],
  },
  {
    kind: "external",
    label: "External System",
    layer: "external",
    icon: "\u{1F310}",
    tone: "rose",
    description: "Third party or out-of-scope dependency.",
    defaultLabel: "Third-party Service",
    tags: ["external", "dependency", "vendor"],
  },
  {
    kind: "note",
    label: "Note",
    layer: "external",
    icon: "\u{1F4DD}",
    tone: "slate",
    description: "Free-form annotation.",
    defaultLabel: "Note",
    tags: ["annotation"],
  },
];

export const NODE_KIND_MAP: Record<NodeKind, NodeKindMeta> = Object.fromEntries(
  NODE_KINDS.map((n) => [n.kind, n]),
) as Record<NodeKind, NodeKindMeta>;

/* ------------------------------------------------------------------ */
/*  Layers                                                            */
/* ------------------------------------------------------------------ */

export interface LayerMeta {
  id: NodeLayer;
  label: string;
  short: string;
  description: string;
  color: string;
}

export const LAYERS: LayerMeta[] = [
  {
    id: "presentation",
    label: "Presentation",
    short: "P",
    description: "What the user sees and touches.",
    color: "#0ea5e9",
  },
  {
    id: "application",
    label: "Application",
    short: "A",
    description: "Use cases, orchestration and business logic.",
    color: "#6366f1",
  },
  {
    id: "domain",
    label: "Domain",
    short: "D",
    description: "Core entities and invariants.",
    color: "#8b5cf6",
  },
  {
    id: "data",
    label: "Data",
    short: "DA",
    description: "Persistence, cache and search.",
    color: "#10b981",
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    short: "I",
    description: "Runtime, network and delivery.",
    color: "#f97316",
  },
  {
    id: "external",
    label: "External",
    short: "E",
    description: "Users and third-party systems.",
    color: "#f43f5e",
  },
];

export const LAYER_MAP: Record<NodeLayer, LayerMeta> = Object.fromEntries(
  LAYERS.map((l) => [l.id, l]),
) as Record<NodeLayer, LayerMeta>;

/* ------------------------------------------------------------------ */
/*  Diagram kinds                                                    */
/* ------------------------------------------------------------------ */

export interface DiagramKindMeta {
  id: DiagramKind;
  label: string;
  icon: string;
  description: string;
}

export const DIAGRAM_KINDS: DiagramKindMeta[] = [
  {
    id: "c4_context",
    label: "C4 Level 1 \u2014 System Context",
    icon: "\u{1F30D}",
    description: "Users, the system as a black box, and external systems.",
  },
  {
    id: "c4_container",
    label: "C4 Level 2 \u2014 Containers",
    icon: "\u{1F5C2}",
    description: "Applications, services, databases and how they talk.",
  },
  {
    id: "c4_component",
    label: "C4 Level 3 \u2014 Components",
    icon: "\u{2699}",
    description: "Break a single container into its internal parts.",
  },
  {
    id: "infrastructure",
    label: "Infrastructure / Cloud",
    icon: "\u{2601}",
    description: "VPCs, subnets, load balancers and managed services.",
  },
  {
    id: "data_flow",
    label: "Data Flow",
    icon: "\u{1F4E6}",
    description: "How data moves through the system and where it is stored.",
  },
  {
    id: "deployment",
    label: "Deployment",
    icon: "\u{1F3D7}",
    description: "Environments, regions and runtime topology.",
  },
];

export const DIAGRAM_KIND_MAP = Object.fromEntries(
  DIAGRAM_KINDS.map((d) => [d.id, d.label]),
) as Record<DiagramKind, string>;

export const DIAGRAM_KIND_META = Object.fromEntries(
  DIAGRAM_KINDS.map((d) => [d.id, d]),
) as Record<DiagramKind, DiagramKindMeta>;

/* ------------------------------------------------------------------ */
/*  HTTP                                                              */
/* ------------------------------------------------------------------ */

export const HTTP_METHODS: HttpMethod[] = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
];

export const METHOD_STYLE: Record<HttpMethod, string> = {
  get: "bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30",
  post: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
  put: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
  patch: "bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-500/30",
  delete: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30",
  head: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30",
  options: "bg-teal-500/15 text-teal-600 dark:text-teal-300 border-teal-500/30",
};

export const METHOD_RAW_STYLE: Record<HttpMethod, string> = {
  get: "#0ea5e9",
  post: "#10b981",
  put: "#f59e0b",
  patch: "#8b5cf6",
  delete: "#f43f5e",
  head: "#64748b",
  options: "#14b8a6",
};

export const AUTH_TYPES: { id: ApiAuthType; label: string; hint: string }[] = [
  { id: "none", label: "No auth", hint: "Public endpoint" },
  { id: "bearer", label: "Bearer JWT", hint: "Authorization: Bearer <token>" },
  { id: "basic", label: "HTTP Basic", hint: "Username and password" },
  { id: "apikey", label: "API key", hint: "X-API-Key header" },
  { id: "oauth2", label: "OAuth 2.0", hint: "Client credentials or auth code" },
  { id: "mtls", label: "Mutual TLS", hint: "Certificate based" },
];

/* ------------------------------------------------------------------ */
/*  Status / roles                                                   */
/* ------------------------------------------------------------------ */

export const PROJECT_STATUSES: { id: ProjectStatus; label: string; tone: string }[] = [
  { id: "draft", label: "Draft", tone: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
  { id: "review", label: "In Review", tone: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
  { id: "approved", label: "Approved", tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
  { id: "archived", label: "Archived", tone: "bg-zinc-500/15 text-zinc-500" },
];

export const PROJECT_STATUS_MAP = Object.fromEntries(
  PROJECT_STATUSES.map((s) => [s.id, s.label]),
) as Record<ProjectStatus, string>;

export const ROLES: { id: "admin" | "editor" | "viewer"; label: string; description: string }[] = [
  { id: "admin", label: "Admin", description: "Full control, can delete the project" },
  { id: "editor", label: "Editor", description: "Can create and edit designs" },
  { id: "viewer", label: "Viewer", description: "Read-only access" },
];

export const ROLE_RANK: Record<"admin" | "editor" | "viewer", number> = {
  admin: 3,
  editor: 2,
  viewer: 1,
};

export const ADR_STATUSES: { id: AdrStatus; label: string; tone: string }[] = [
  { id: "proposed", label: "Proposed", tone: "bg-sky-500/15 text-sky-600 dark:text-sky-300" },
  { id: "accepted", label: "Accepted", tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
  { id: "rejected", label: "Rejected", tone: "bg-rose-500/15 text-rose-600 dark:text-rose-300" },
  { id: "superseded", label: "Superseded", tone: "bg-zinc-500/15 text-zinc-500" },
];

export const ADR_STATUS_MAP = Object.fromEntries(
  ADR_STATUSES.map((s) => [s.id, s.label]),
) as Record<AdrStatus, string>;

/* ------------------------------------------------------------------ */
/*  Services                                                          */
/* ------------------------------------------------------------------ */

export const SERVICE_CATEGORIES: { id: ServiceCategory; label: string; icon: string }[] = [
  { id: "compute", label: "Compute", icon: "\u{1F5A5}" },
  { id: "serverless", label: "Serverless", icon: "\u{26A1}" },
  { id: "database", label: "Database", icon: "\u{1F5C4}" },
  { id: "cache", label: "Cache & Queue", icon: "\u{1F50B}" },
  { id: "storage", label: "Storage", icon: "\u{1F5C2}" },
  { id: "network", label: "Network", icon: "\u{1F6AA}" },
  { id: "auth", label: "Auth & Identity", icon: "\u{1F511}" },
  { id: "observability", label: "Observability", icon: "\u{1F4CA}" },
  { id: "cicd", label: "CI/CD", icon: "\u{1F504}" },
  { id: "ai", label: "AI & ML", icon: "\u{1F916}" },
  { id: "other", label: "Other", icon: "\u{1F6E0}" },
];

export const SERVICE_CATEGORY_MAP = Object.fromEntries(
  SERVICE_CATEGORIES.map((c) => [c.id, c.label]),
) as Record<ServiceCategory, string>;

/** Rough hours-per-month factors used to normalise mixed billing units. */
export const UNIT_FACTORS: Record<string, { hours: number; requests: number; gb: number }> = {
  hour: { hours: 1, requests: 0, gb: 0 },
  "node-hour": { hours: 1, requests: 0, gb: 0 },
  "vCPU-month": { hours: 730, requests: 0, gb: 0 },
  month: { hours: 0, requests: 0, gb: 0 },
  request: { hours: 0, requests: 1, gb: 0 },
  "build-minute": { hours: 1 / 60, requests: 0, gb: 0 },
  "gb-month": { hours: 0, requests: 0, gb: 1 },
};

/* ------------------------------------------------------------------ */
/*  Review severities                                                 */
/* ------------------------------------------------------------------ */

export const SEVERITY_META: Record<
  ReviewSeverity,
  { label: string; tone: string; weight: number }
> = {
  critical: { label: "Critical", tone: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30", weight: 25 },
  high: { label: "High", tone: "bg-orange-500/15 text-orange-600 dark:text-orange-300 border-orange-500/30", weight: 12 },
  medium: { label: "Medium", tone: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30", weight: 6 },
  low: { label: "Low", tone: "bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30", weight: 2 },
  info: { label: "Info", tone: "bg-zinc-500/15 text-zinc-500 dark:text-zinc-400 border-zinc-500/30", weight: 0 },
};

export const SEVERITY_ORDER: ReviewSeverity[] = ["critical", "high", "medium", "low", "info"];

/* ------------------------------------------------------------------ */
/*  Misc                                                              */
/* ------------------------------------------------------------------ */

export const DIRECTIONS: DiagramEdgeDirection[] = ["sync", "async", "batch", "stream"];

export type DiagramEdgeDirection = "sync" | "async" | "batch" | "stream";

export const DIRECTION_META: Record<DiagramEdgeDirection, { label: string; dashed: boolean }> = {
  sync: { label: "Synchronous", dashed: false },
  async: { label: "Asynchronous", dashed: true },
  batch: { label: "Batch", dashed: true },
  stream: { label: "Streaming", dashed: true },
};

export const COMMON_PROTOCOLS = [
  "HTTPS",
  "HTTP",
  "gRPC",
  "GraphQL",
  "WebSocket",
  "AMQP",
  "Kafka",
  "SQS",
  "Redis",
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "TCP",
  "SMTP",
];

export const CRITICALITY_OPTIONS = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
] as const;
