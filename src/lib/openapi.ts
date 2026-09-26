import type { ApiEndpoint, ApiParam, ApiSpec, ServiceSelection } from "./types";
import { AUTH_TYPES, HTTP_METHODS, METHOD_RAW_STYLE } from "./constants";

/* ------------------------------------------------------------------ */
/*  OpenAPI 3.1 generation                                            */
/* ------------------------------------------------------------------ */

function pathToOpenApiKey(path: string): string {
  if (!path.startsWith("/")) return `/${path}`;
  return path;
}

function paramToSchema(param: ApiParam): Record<string, unknown> {
  const type = (param.type || "string").toLowerCase();
  const schema: Record<string, unknown> =
    type === "integer" || type === "int"
      ? { type: "integer" }
      : type === "number" || type === "float"
        ? { type: "number" }
        : type === "boolean"
          ? { type: "boolean" }
          : type === "array"
            ? { type: "array", items: { type: "string" } }
            : { type: "string" };

  if (param.example) schema.example = param.example;
  if (param.description) schema.description = param.description;

  return {
    name: param.name,
    in: param.in,
    required: param.required || param.in === "path",
    description: param.description || undefined,
    schema,
  };
}

/** Infers a sensible default response body from a `responses` jsonb blob. */
function normalizeResponses(endpoint: ApiEndpoint): Record<string, unknown> {
  const raw = endpoint.responses ?? {};
  const out: Record<string, unknown> = {};

  for (const [status, value] of Object.entries(raw)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const v = value as Record<string, unknown>;
      out[status] = {
        description: (v.description as string) || "Response",
        content: v.schema
          ? { "application/json": { schema: v.schema } }
          : undefined,
      };
    } else {
      out[status] = { description: String(value) };
    }
  }

  if (Object.keys(out).length === 0) {
    out["200"] = { description: "Successful response" };
  }
  return out;
}

function securityFor(endpoint: ApiEndpoint): Record<string, unknown> {
  if (endpoint.auth_type === "none") return {};
  if (endpoint.auth_type === "oauth2") return { oauth2: [] };
  if (endpoint.auth_type === "apikey") return { apiKeyAuth: [] };
  if (endpoint.auth_type === "mtls") return { mutualTLS: [] };
  return { bearerAuth: [] };
}

export interface OpenApiOptions {
  spec: ApiSpec;
  endpoints: ApiEndpoint[];
  projectName: string;
  projectDescription?: string;
  contactName?: string;
}

/** Builds a complete, spec-compliant OpenAPI 3.1 document. */
export function buildOpenApiDocument({
  spec,
  endpoints,
  projectName,
  projectDescription,
  contactName,
}: OpenApiOptions): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  const tags = new Set<string>();

  for (const endpoint of endpoints) {
    const key = pathToOpenApiKey(endpoint.path);

    for (const err of endpoint.errors ?? []) {
      if (err) tags.add("Errors");
    }

    const operation: Record<string, unknown> = {
      operationId: endpoint.operation_id || `${endpoint.method}_${key.replace(/\W+/g, "_")}`,
      summary: endpoint.summary || undefined,
      description: endpoint.description || undefined,
      tags: endpoint.tags?.length ? endpoint.tags : [endpoint.group_name || "default"],
      deprecated: endpoint.is_deprecated || undefined,
    };

    endpoint.tags?.forEach((t) => tags.add(t));
    if (!endpoint.tags?.length) tags.add(endpoint.group_name || "default");

    const openApiParams = (endpoint.params ?? []).map(paramToSchema).filter(Boolean);
    if (openApiParams.length) operation.parameters = openApiParams;

    if (endpoint.request_body && ["post", "put", "patch"].includes(endpoint.method)) {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: endpoint.request_body,
            example: extractExample(endpoint.request_body),
          },
        },
      };
    }

    operation.responses = normalizeResponses(endpoint);

    if (endpoint.rate_limit) {
      operation["x-rate-limit"] = endpoint.rate_limit;
    }

    const security = securityFor(endpoint);
    operation.security = Object.keys(security).length > 0 ? [security] : [];

    paths[key] ??= {};
    paths[key][endpoint.method] = operation;
  }

  const document: Record<string, unknown> = {
    openapi: "3.1.0",
    info: {
      title: `${spec.name}`,
      version: spec.version || "1.0.0",
      description:
        spec.description || projectDescription || `API specification for ${projectName}.`,
      ...(contactName ? { contact: { name: contactName } } : {}),
    },
    servers: [
      { url: spec.base_url, description: "Primary" },
      { url: spec.base_url.replace(/\/v\d+$/, "/sandbox"), description: "Sandbox" },
    ],
    tags: Array.from(tags)
      .filter(Boolean)
      .sort()
      .map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        apiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
        oauth2: {
          type: "oauth2",
          flows: {
            clientCredentials: {
              tokenUrl: `${spec.base_url}/oauth/token`,
              scopes: {},
            },
          },
        },
        mutualTLS: { type: "mutualTLS" },
      },
    },
    security: [{ bearerAuth: [] }],
  };

  return document;
}

/** Best-effort example payload derived from a JSON Schema fragment. */
export function extractExample(schema: unknown, depth = 0): unknown {
  if (depth > 6 || schema === null || typeof schema !== "object") return null;

  const s = schema as Record<string, unknown>;
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];

  switch (s.type) {
    case "object": {
      const props = (s.properties ?? {}) as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(props)) {
        out[key] = extractExample(value, depth + 1);
      }
      return out;
    }
    case "array":
      return [extractExample(s.items, depth + 1)];
    case "integer":
      return 1;
    case "number":
      return 1.0;
    case "boolean":
      return true;
    case "string": {
      const fmt = s.format as string | undefined;
      if (fmt === "date-time") return "2026-01-01T00:00:00Z";
      if (fmt === "date") return "2026-01-01";
      if (fmt === "email") return "user@example.com";
      if (fmt === "uuid") return "00000000-0000-4000-8000-000000000000";
      return "string";
    }
    default:
      return null;
  }
}

/** Renders the OpenAPI document as pretty JSON. */
export function openApiToJson(doc: unknown): string {
  return JSON.stringify(doc, null, 2);
}

/* ------------------------------------------------------------------ */
/*  Import: Postman / generic JSON -> endpoint drafts                  */
/* ------------------------------------------------------------------ */

export interface ImportedEndpoint {
  method: string;
  path: string;
  summary: string;
  description: string;
  group_name: string;
  auth_type: string;
  tags: string[];
  params: ApiParam[];
  request_body: Record<string, unknown> | null;
  responses: Record<string, unknown>;
}

function detectPathParam(path: string, query: Record<string, string>): ApiParam[] {
  const params: ApiParam[] = [];
  for (const match of path.matchAll(/\{([^}]+)\}/g)) {
    params.push({
      name: match[1],
      in: "path",
      required: true,
      type: "string",
      description: `Value for ${match[1]}`,
    });
  }
  for (const [key, value] of Object.entries(query)) {
    params.push({
      name: key,
      in: "query",
      required: false,
      type: typeof value === "string" && /^\d+$/.test(value) ? "integer" : "string",
      description: "",
      example: value,
    });
  }
  return params;
}

/** Parses a Postman Collection v2.1 export into endpoint drafts. */
export function parsePostmanCollection(raw: string): ImportedEndpoint[] {
  const collection = JSON.parse(raw) as {
    item?: PostmanItem[];
  };

  const out: ImportedEndpoint[] = [];

  const walk = (items: PostmanItem[] | undefined, group: string) => {
    for (const item of items ?? []) {
      if (item.item) {
        walk(item.item, item.name || group);
        continue;
      }
      if (!item.request) continue;

      const req = item.request;
      const url = typeof req.url === "string" ? req.url : (req.url?.raw ?? "");
      const pathOnly = url.split("?")[0] || "/";
      const query: Record<string, string> = {};
      const queryStr = url.split("?")[1];
      if (queryStr) {
        for (const pair of queryStr.split("&")) {
          const [k, v] = pair.split("=");
          if (k) query[k] = decodeURIComponent(v ?? "");
        }
      }

      const method = String(req.method ?? "GET").toLowerCase();
      let bodySchema: Record<string, unknown> | null = null;
      if (req.body?.raw) {
        try {
          bodySchema = { type: "object", additionalProperties: true };
          out.push({
            method,
            path: pathOnly,
            summary: item.name || "",
            description: (req.description as string) || "",
            group_name: group,
            auth_type: "bearer",
            tags: group ? [group] : [],
            params: detectPathParam(pathOnly, query),
            request_body: bodySchema,
            responses: { "200": { description: "Successful response" } },
          });
          continue;
        } catch {
          /* not JSON, fall through */
        }
      }

      out.push({
        method,
        path: pathOnly,
        summary: item.name || "",
        description: (req.description as string) || "",
        group_name: group,
        auth_type: "bearer",
        tags: group ? [group] : [],
        params: detectPathParam(pathOnly, query),
        request_body: bodySchema,
        responses: { "200": { description: "Successful response" } },
      });
    }
  };

  walk(collection.item, "imported");
  const valid = new Set<string>(HTTP_METHODS);
  return out.filter((e) => valid.has(e.method));
}

interface PostmanItem {
  name?: string;
  item?: PostmanItem[];
  request?: {
    method?: string;
    url?: string | { raw?: string };
    description?: string | { content?: string };
    body?: { raw?: string };
  };
}

/* ------------------------------------------------------------------ */
/*  API quality heuristics                                            */
/* ------------------------------------------------------------------ */

export interface ApiIssue {
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  endpointId?: string;
}

export function analyzeApiQuality(endpoints: ApiEndpoint[]): ApiIssue[] {
  const issues: ApiIssue[] = [];

  if (endpoints.length === 0) {
    issues.push({ severity: "high", message: "No endpoints defined yet." });
    return issues;
  }

  const seen = new Set<string>();
  const withoutSummary = endpoints.filter((e) => !e.summary.trim()).length;
  const withoutDescription = endpoints.filter((e) => !e.description.trim()).length;
  const withoutOperationId = endpoints.filter((e) => !e.operation_id.trim()).length;
  const withoutErrors = endpoints.filter((e) => (e.errors ?? []).length === 0).length;
  const withoutRateLimit = endpoints.filter((e) => !e.rate_limit?.trim()).length;
  const withoutTags = endpoints.filter((e) => (e.tags ?? []).length === 0).length;

  if (withoutSummary > 0) {
    issues.push({
      severity: withoutSummary === endpoints.length ? "high" : "low",
      message: `${withoutSummary} endpoint(s) have no summary.`,
    });
  }
  if (withoutDescription > 0) {
    issues.push({
      severity: withoutDescription === endpoints.length ? "medium" : "info" as never,
      message: `${withoutDescription} endpoint(s) have no description.`,
    });
  }
  if (withoutOperationId > 0) {
    issues.push({
      severity: "medium",
      message: `${withoutOperationId} endpoint(s) have no operationId, which breaks generated SDKs.`,
    });
  }
  if (withoutErrors > 0) {
    issues.push({
      severity: "high",
      message: `${withoutErrors} endpoint(s) do not document any error responses.`,
    });
  }
  if (withoutRateLimit > 0) {
    issues.push({
      severity: "low",
      message: `${withoutRateLimit} endpoint(s) have no documented rate limit.`,
    });
  }
  if (withoutTags > 0) {
    issues.push({ severity: "low", message: `${withoutTags} endpoint(s) have no tags.` });
  }

  for (const endpoint of endpoints) {
    const key = `${endpoint.method} ${endpoint.path}`;
    if (seen.has(key)) {
      issues.push({ severity: "high", message: `Duplicate route: ${key}`, endpointId: endpoint.id });
    }
    seen.add(key);

    const pathParams = (endpoint.params ?? []).filter((p) => p.in === "path").map((p) => p.name);
    const declared = Array.from(endpoint.path.matchAll(/\{([^}]+)\}/g)).map((m) => m[1]);
    for (const missing of declared.filter((p) => !pathParams.includes(p))) {
      issues.push({
        severity: "critical",
        message: `${key} uses {${missing}} but does not declare it as a path parameter.`,
        endpointId: endpoint.id,
      });
    }

    if (endpoint.method === "get" && endpoint.request_body) {
      issues.push({
        severity: "medium",
        message: `${key} is a GET but defines a request body.`,
        endpointId: endpoint.id,
      });
    }

    if (["post", "put", "patch"].includes(endpoint.method) && !endpoint.request_body) {
      issues.push({
        severity: "medium",
        message: `${key} is a write operation with no request body schema.`,
        endpointId: endpoint.id,
      });
    }

    if (!endpoint.path.startsWith("/")) {
      issues.push({
        severity: "low",
        message: `${key} path should start with "/".`,
        endpointId: endpoint.id,
      });
    }
  }

  return issues;
}

/* ------------------------------------------------------------------ */
/*  Misc helpers                                                      */
/* ------------------------------------------------------------------ */

export function methodColor(method: string): string {
  return METHOD_RAW_STYLE[method.toLowerCase() as keyof typeof METHOD_RAW_STYLE] ?? "#64748b";
}

export function authLabel(authType: string): string {
  return AUTH_TYPES.find((a) => a.id === authType)?.label ?? authType;
}

/** Default rate-limit suggestions per HTTP method. */
export function defaultRateLimit(method: string): string {
  switch (method.toLowerCase()) {
    case "get":
      return "1000 requests/minute";
    case "post":
      return "100 requests/minute";
    case "put":
    case "patch":
      return "300 requests/minute";
    case "delete":
      return "100 requests/minute";
    default:
      return "600 requests/minute";
  }
}

export function emptyCostSelections(): ServiceSelection[] {
  return [];
}
