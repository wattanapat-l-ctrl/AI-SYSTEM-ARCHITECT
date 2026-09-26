import type { ApiEndpoint, ApiSpec } from "./types";
import { extractExample } from "./openapi";

/* ------------------------------------------------------------------ */
/*  Type helpers                                                      */
/* ------------------------------------------------------------------ */

function tsType(schema: unknown, indent = 0): string {
  if (!schema || typeof schema !== "object") return "unknown";
  const s = schema as Record<string, unknown>;
  const pad = "  ".repeat(indent);

  if (Array.isArray(s.enum) && s.enum.length) {
    return s.enum.map((v) => JSON.stringify(v)).join(" | ");
  }

  switch (s.type) {
    case "string":
      return "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return `${tsType(s.items, indent)}[]`;
    case "object": {
      const required = new Set((s.required as string[] | undefined) ?? []);
      const props = (s.properties ?? {}) as Record<string, unknown>;
      const entries = Object.entries(props);
      if (entries.length === 0) return "Record<string, unknown>";
      const lines = entries.map(
        ([key, value]) =>
          `${pad}  ${JSON.stringify(key)}${required.has(key) ? "" : "?"}: ${tsType(value, indent + 1)};`,
      );
      return `{\n${lines.join("\n")}\n${pad}}`;
    }
    default:
      return "unknown";
  }
}

function pascal(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9]+(.)?/g, (_, c: string) => (c ? c.toUpperCase() : ""))
    .replace(/^./, (c) => c.toUpperCase());
}

function camel(input: string): string {
  const p = pascal(input);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function statusCodeFor(method: string): string {
  switch (method.toLowerCase()) {
    case "post":
      return "201";
    case "delete":
      return "204";
    default:
      return "200";
  }
}

function primaryResponse(endpoint: ApiEndpoint): string {
  const keys = Object.keys(endpoint.responses ?? {});
  if (keys.length === 0) return statusCodeFor(endpoint.method);
  const numeric = keys
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b));
  const success = numeric.find((k) => k.startsWith("2"));
  return success ?? numeric[0] ?? statusCodeFor(endpoint.method);
}

function successSchema(endpoint: ApiEndpoint): unknown {
  const key = primaryResponse(endpoint);
  const entry = (endpoint.responses ?? {})[key] as Record<string, unknown> | undefined;
  return entry?.schema ?? { type: "object" };
}

/* ------------------------------------------------------------------ */
/*  TypeScript SDK                                                    */
/* ------------------------------------------------------------------ */

export function generateTypeScriptClient(spec: ApiSpec, endpoints: ApiEndpoint[]): string {
  const lines: string[] = [];
  const base = spec.base_url.replace(/\/$/, "");

  lines.push(`/* eslint-disable */`);
  lines.push(`/**`);
  lines.push(` * ${spec.name} \u2014 generated TypeScript client`);
  lines.push(` * Version ${spec.version}`);
  lines.push(` */`);
  lines.push(``);
  lines.push(`export const BASE_URL = ${JSON.stringify(base)};`);
  lines.push(``);
  lines.push(`export class ApiError extends Error {`);
  lines.push(`  constructor(public status: number, public body: unknown, message: string) {`);
  lines.push(`    super(message);`);
  lines.push(`    this.name = "ApiError";`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`export interface RequestOptions {`);
  lines.push(`  query?: Record<string, string | number | boolean | undefined>;`);
  lines.push(`  headers?: Record<string, string>;`);
  lines.push(`  body?: unknown;`);
  lines.push(`  token?: string;`);
  lines.push(`  signal?: AbortSignal;`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {`);
  lines.push(`  const url = new URL(\`\${BASE_URL}\${path}\`);`);
  lines.push(`  for (const [k, v] of Object.entries(opts.query ?? {})) {`);
  lines.push(`    if (v !== undefined) url.searchParams.set(k, String(v));`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  const headers: Record<string, string> = {`);
  lines.push(`    Accept: "application/json",`);
  lines.push(`    ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),`);
  lines.push(`    ...opts.headers,`);
  lines.push(`  };`);
  lines.push(`  if (opts.token) headers.Authorization = \`Bearer \${opts.token}\`;`);
  lines.push(``);
  lines.push(`  const res = await fetch(url.toString(), {`);
  lines.push(`    method,`);
  lines.push(`    headers,`);
  lines.push(`    signal: opts.signal,`);
  lines.push(`    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,`);
  lines.push(`  });`);
  lines.push(``);
  lines.push(`  const text = await res.text();`);
  lines.push(`  const parsed = text ? JSON.parse(text) : null;`);
  lines.push(`  if (!res.ok) {`);
  lines.push(`    throw new ApiError(res.status, parsed, parsed?.message ?? res.statusText);`);
  lines.push(`  }`);
  lines.push(`  return parsed as T;`);
  lines.push(`}`);
  lines.push(``);

  // One interface per named body type
  const emitted = new Set<string>();
  for (const endpoint of endpoints) {
    const bodySchema = endpoint.request_body;
    if (!bodySchema) continue;
    const name = `${pascal(endpoint.operation_id || endpoint.path)}${endpoint.method === "get" ? "Query" : "Request"}`;
    if (emitted.has(name)) continue;
    emitted.add(name);
    lines.push(`export interface ${name} ${tsType(bodySchema)};`);
  }
  lines.push(``);

  lines.push(`export const api = {`);
  const byGroup = new Map<string, ApiEndpoint[]>();
  for (const endpoint of endpoints) {
    const group = endpoint.group_name || "default";
    byGroup.set(group, [...(byGroup.get(group) ?? []), endpoint]);
  }

  for (const [group, groupEndpoints] of byGroup) {
    lines.push(`  // \u2500\u2500 ${group} \u2500\u2500`);
    for (const endpoint of groupEndpoints) {
      const fnName = camel(endpoint.operation_id || `${endpoint.method}_${endpoint.path}`);
      const typeName = `${pascal(endpoint.operation_id || endpoint.path)}${endpoint.method === "get" ? "Query" : "Request"}`;

      lines.push(`  /**`);
      lines.push(`   * ${endpoint.summary || endpoint.path}`);
      lines.push(`   * @remarks ${endpoint.rate_limit ? `Rate limit: ${endpoint.rate_limit}` : "No documented rate limit"}`);
      if (endpoint.is_deprecated) lines.push(`   * @deprecated`);
      lines.push(`   */`);
      lines.push(`  ${fnName}(params: Record<string, string> = {}, opts: RequestOptions = {}) {`);

      const pathParamNames = (endpoint.params ?? []).filter((p) => p.in === "path").map((p) => p.name);
      if (pathParamNames.length > 0) {
        lines.push(`    let path = ${JSON.stringify(endpoint.path)};`);
        for (const name of pathParamNames) {
          lines.push(`    path = path.replace(\`{\${${JSON.stringify(name)}}}\`, encodeURIComponent(String(params[${JSON.stringify(name)}] ?? "")));`);
        }
        lines.push(`    const query = Object.fromEntries(Object.entries(params).filter(([k]) => !${JSON.stringify(pathParamNames)}.includes(k)));`);
        lines.push(`    return request<any>("${endpoint.method.toUpperCase()}", path, { ...opts, query });`);
      } else {
        const hasQuery = (endpoint.params ?? []).some((p) => p.in === "query");
        const hasBody = ["post", "put", "patch"].includes(endpoint.method);
        const optsBits = ["...opts"];
        if (hasQuery) optsBits.unshift("query: { ...params, ...(opts.query ?? {}) }");
        if (hasBody) optsBits.push("body: (opts.body ?? {}) as " + typeName);
        lines.push(`    return request<any>("${endpoint.method.toUpperCase()}", ${JSON.stringify(endpoint.path)}, { ${optsBits.join(", ")} });`);
      }

      lines.push(`  },`);
    }
  }
  lines.push(`};`);
  lines.push(``);
  lines.push(`export default api;`);

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Server-side route scaffold (Next.js App Router)                   */
/* ------------------------------------------------------------------ */

export function generateNextRoute(endpoint: ApiEndpoint, spec: ApiSpec): string {
  const segments = endpoint.path.split("/").filter(Boolean);
  const dynamicSegments: string[] = endpoint.path.match(/\{(\w+)\}/g) ?? [];
  const dir = segments
    .map((seg, i) => {
      const isLast = i === segments.length - 1;
      if (seg.startsWith("{")) {
        return dynamicSegments.includes(seg) ? `[${seg.slice(1, -1)}]` : seg;
      }
      if (dynamicSegments.length > 0 && !isLast) return seg;
      return seg;
    })
    .join("/");

  const paramNames = (endpoint.params ?? []).filter((p) => p.in === "path").map((p) => p.name);
  const isCollection = endpoint.method === "post";

  const success = primaryResponse(endpoint);
  const schema = successSchema(endpoint);

  const lines: string[] = [];
  lines.push(`// ${endpoint.method.toUpperCase()} ${endpoint.path} \u2014 ${spec.name}`);
  lines.push(`// Generated by AI System Architect. Adjust the handler body as needed.`);
  lines.push(`import { NextResponse } from "next/server";`);
  if (!isCollection && paramNames.length > 0) {
    lines.push(``);
    lines.push(`type Ctx = { params: Promise<{ ${paramNames.map((n) => `${n}: string`).join("; ")} }> };`);
  }
  lines.push(``);
  lines.push(`export async function ${endpoint.method.toUpperCase()}(request: Request${paramNames.length > 0 ? ", ctx: Ctx" : ""}) {`);
  if (paramNames.length > 0) {
    lines.push(`  const { ${paramNames.join(", ")} } = await ctx.params;`);
  }
  lines.push(``);

  if (["post", "put", "patch"].includes(endpoint.method)) {
    lines.push(`  const payload = await request.json().catch(() => ({}));`);
    lines.push(`  // TODO: validate payload`);
  }

  lines.push(`  // TODO: implement ${endpoint.summary || endpoint.path}`);
  lines.push(`  void request;`);
  lines.push(``);
  lines.push(`  return NextResponse.json(`);
  lines.push(`    ${success === "204" ? "null" : "{}"},`);
  lines.push(`    { status: ${success} }`);
  lines.push(`  );`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`// Expected response body schema:`);
  lines.push(`// ${JSON.stringify(schema, null, 2)}`);
  lines.push(`//`);
  lines.push(`// Route file location: app/api/${dir}/route.ts`);

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  cURL commands                                                     */
/* ------------------------------------------------------------------ */

export function generateCurl(spec: ApiSpec, endpoints: ApiEndpoint[]): string {
  const base = spec.base_url.replace(/\/$/, "");
  const lines: string[] = [];

  for (const endpoint of endpoints) {
    if (endpoint.is_deprecated) {
      lines.push(`# \u26A0 Deprecated: ${endpoint.path}`);
    }
    lines.push(`# ${endpoint.method.toUpperCase()} ${endpoint.path} \u2014 ${endpoint.summary || "no summary"}`);
    if (endpoint.rate_limit) lines.push(`# Rate limit: ${endpoint.rate_limit}`);
    lines.push(`curl -X ${endpoint.method.toUpperCase()} \\`);
    lines.push(`  '${base}${endpoint.path}' \\`);

    const bits: string[] = [`-H 'Accept: application/json'`];
    if (endpoint.auth_type === "bearer") {
      bits.push(`-H 'Authorization: Bearer $TOKEN'`);
    } else if (endpoint.auth_type === "apikey") {
      bits.push(`-H 'X-API-Key: $API_KEY'`);
    }

    if (["post", "put", "patch"].includes(endpoint.method)) {
      const example = extractExample(endpoint.request_body);
      if (example) {
        bits.push(`-H 'Content-Type: application/json'`);
        bits.push(`-d '${JSON.stringify(example, null, 2)}'`);
      }
    }
    lines.push(`  ${bits.join(" \\\n  ")}`);
    lines.push(``);
  }

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Mock server (Node, no dependencies)                               */
/* ------------------------------------------------------------------ */

export function generateMockServer(spec: ApiSpec, endpoints: ApiEndpoint[]): string {
  return `/**
 * ${spec.name} \u2014 mock API server
 * Generated by AI System Architect.
 *
 * Run:  node mock-server.js
 * Uses only Node built-ins, so there is nothing to install.
 */
import { createServer } from "node:http";

const PORT = process.env.PORT ?? 3001;

const routes = {
${endpoints
  .map((e) => {
    const success = primaryResponse(e);
    const payload = success === "204" ? "null" : JSON.stringify(extractExample(successSchema(e)), null, 6);
    return `  "${e.method.toUpperCase()} ${e.path}": { status: ${success}, body: ${payload} },`;
  })
  .join("\n")}
};

function compile(path) {
  const keys = [];
  const source = path.replace(/\\{(\\w+)\\}/g, (_, name) => {
    keys.push(name);
    return "([^/]+)";
  });
  return { regex: new RegExp(\`^\${source}$\`), keys };
}

const compiled = Object.entries(routes).map(([key, value]) => {
  const [method, path] = key.split(" ");
  return { method, regex: compile(path).regex, ...value };
});

const server = createServer((req, res) => {
  const url = new URL(req.url, \`http://\${req.headers.host}\`);
  const match = compiled.find((r) => r.method === req.method && r.regex.test(url.pathname));

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (!match) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "No mock route for \${req.method} \${url.pathname}" }));
    return;
  }

  res.writeHead(match.status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(match.body));
});

server.listen(PORT, () => {
  console.log(\`Mock server for ${spec.name} listening on http://localhost:\${PORT}\`);
});
`;
}

/* ------------------------------------------------------------------ */
/*  Aggregate export                                                  */
/* ------------------------------------------------------------------ */

export interface GeneratedCode {
  typescriptClient: string;
  curl: string;
  mockServer: string;
  routes: { endpoint: ApiEndpoint; code: string }[];
}

export function generateAllCode(spec: ApiSpec, endpoints: ApiEndpoint[]): GeneratedCode {
  return {
    typescriptClient: generateTypeScriptClient(spec, endpoints),
    curl: generateCurl(spec, endpoints),
    mockServer: generateMockServer(spec, endpoints),
    routes: endpoints.map((endpoint) => ({
      endpoint,
      code: generateNextRoute(endpoint, spec),
    })),
  };
}
