/**
 * Database row types. These mirror supabase/schema.sql exactly.
 * Kept hand-written (rather than generated) so they stay readable and
 * require no codegen step at build time.
 */

export type AppRole = "admin" | "editor" | "viewer";
export type ProjectStatus = "draft" | "review" | "approved" | "archived";
export type DiagramKind =
  | "c4_context"
  | "c4_container"
  | "c4_component"
  | "infrastructure"
  | "data_flow"
  | "deployment";
export type NodeKind =
  | "person"
  | "client_web"
  | "client_mobile"
  | "client_cli"
  | "gateway"
  | "service"
  | "worker"
  | "queue"
  | "database"
  | "cache"
  | "object_storage"
  | "search"
  | "serverless"
  | "container"
  | "vm"
  | "cicd"
  | "external"
  | "note";
export type NodeLayer =
  | "presentation"
  | "application"
  | "domain"
  | "data"
  | "infrastructure"
  | "external";
export type HttpMethod =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "head"
  | "options";
export type ApiAuthType = "none" | "bearer" | "basic" | "apikey" | "oauth2" | "mtls";
export type AdrStatus = "proposed" | "accepted" | "rejected" | "superseded";
export type ServiceCategory =
  | "compute"
  | "database"
  | "storage"
  | "cache"
  | "network"
  | "observability"
  | "cicd"
  | "auth"
  | "ai"
  | "serverless"
  | "other";
export type ReviewSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: AppRole;
  job_title: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: ProjectStatus;
  context: ProjectContext;
  owner_id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface ProjectContext {
  goal?: string;
  scope?: string;
  users?: string[];
  constraints?: string[];
  [key: string]: unknown;
}

export interface ProjectSummary extends Project {
  my_role: AppRole | null;
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
  profile: Profile | null;
}

export interface Diagram {
  id: string;
  project_id: string;
  name: string;
  kind: DiagramKind;
  description: string;
  current_version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DiagramNodeData {
  label: string;
  description: string;
  kind: NodeKind;
  layer: NodeLayer;
  technology: string;
  responsibility: string;
  criticality: "low" | "medium" | "high";
  notes: string;
  replication: string;
  [key: string]: unknown;
}

export interface DiagramEdgeData {
  protocol: string;
  direction: "sync" | "async" | "batch" | "stream";
  description: string;
  auth: string;
  sla: string;
  label: string;
  [key: string]: unknown;
}

export interface DiagramVersion {
  id: string;
  diagram_id: string;
  version: number;
  nodes: unknown[];
  edges: unknown[];
  viewport: Record<string, unknown>;
  notes: string;
  created_by: string;
  created_at: string;
}

export interface ApiSpec {
  id: string;
  project_id: string;
  name: string;
  version: string;
  base_url: string;
  description: string;
  servers: unknown[];
  created_at: string;
  updated_at: string;
}

export interface ApiParam {
  name: string;
  in: "query" | "header" | "path" | "cookie";
  required: boolean;
  type: string;
  description: string;
  example?: string;
}

export interface ApiResponseDef {
  status: string;
  description: string;
  /** JSON Schema fragment */
  schema?: Record<string, unknown>;
}

export interface ApiErrorDef {
  code: string;
  description: string;
  httpStatus: number;
}

export interface ApiEndpoint {
  id: string;
  api_spec_id: string;
  group_name: string;
  method: HttpMethod;
  path: string;
  operation_id: string;
  summary: string;
  description: string;
  auth_type: ApiAuthType;
  tags: string[];
  params: ApiParam[];
  request_body: Record<string, unknown> | null;
  responses: Record<string, unknown>;
  errors: ApiErrorDef[];
  rate_limit: string;
  is_deprecated: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceCatalogItem {
  id: string;
  key: string;
  name: string;
  vendor: string;
  category: ServiceCategory;
  unit: string;
  unit_price_usd: number | string;
  pricing_note: string;
  description: string;
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServiceSelection {
  id: string;
  project_id: string;
  service_id: string;
  quantity: number | string;
  notes: string;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  service: ServiceCatalogItem | null;
}

export interface Adr {
  id: string;
  project_id: string;
  number: number;
  title: string;
  status: AdrStatus;
  context: string;
  decision: string;
  consequences: string;
  alternatives: string;
  tags: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ReviewFinding {
  severity: ReviewSeverity;
  title: string;
  detail: string;
  suggestion: string;
  category: string;
}

export interface AiReview {
  id: string;
  project_id: string;
  diagram_id: string | null;
  engine: string;
  model: string;
  score: number;
  summary: string;
  findings: ReviewFinding[];
  created_by: string;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  project_id: string;
  title: string;
  kind: string;
  content_markdown: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: number;
  project_id: string | null;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor: Pick<Profile, "id" | "full_name" | "email" | "avatar_url"> | null;
}
