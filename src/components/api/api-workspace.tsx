"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  CodeBlock,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Tabs,
  Textarea,
} from "@/components/ui";
import { IDLE, type ActionState } from "@/lib/utils";
import { analyzeApiQuality, buildOpenApiDocument, openApiToJson, authLabel } from "@/lib/openapi";
import { generateAllCode } from "@/lib/codegen";
import { downloadText } from "@/lib/utils";
import { EndpointDialog, MethodBadge } from "@/components/api/endpoint-dialog";
import { SpecDialog } from "@/components/api/spec-dialog";
import {
  deleteEndpointAction,
  deleteSpecAction,
  importPostmanAction,
} from "@/app/actions/api";
import type { ApiEndpoint, ApiSpec } from "@/lib/types";

export function ApiWorkspace({
  projectId,
  specs,
  endpoints,
  canEdit,
  isAdmin,
  projectName,
}: {
  projectId: string;
  specs: ApiSpec[];
  endpoints: ApiEndpoint[];
  canEdit: boolean;
  isAdmin: boolean;
  projectName: string;
}) {
  const router = useRouter();

  const [preferredSpecId, setPreferredSpecId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState("endpoints");
  const [editing, setEditing] = React.useState<ApiEndpoint | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [specOpen, setSpecOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [methodFilter, setMethodFilter] = React.useState("all");
  const [actionError, setActionError] = React.useState("");

  // Derived: fall back to the first spec when the preferred one disappears, so
  // no effect is needed to keep the selection valid.
  const activeSpecId =
    preferredSpecId && specs.some((s) => s.id === preferredSpecId)
      ? preferredSpecId
      : (specs[0]?.id ?? "");

  const spec = specs.find((s) => s.id === activeSpecId) ?? null;

  // Endpoints are only ever queried for the selected spec.
  const specEndpoints = React.useMemo(
    () => endpoints.filter((e) => e.api_spec_id === activeSpecId),
    [endpoints, activeSpecId],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return specEndpoints
      .filter((e) => methodFilter === "all" || e.method === methodFilter)
      .filter(
        (e) =>
          !q ||
          e.path.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q) ||
          e.group_name.toLowerCase().includes(q),
      )
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [specEndpoints, query, methodFilter]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, ApiEndpoint[]>();
    for (const e of filtered) {
      const list = map.get(e.group_name) ?? [];
      list.push(e);
      map.set(e.group_name, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const issues = React.useMemo(() => analyzeApiQuality(specEndpoints), [specEndpoints]);

  const openApiJson = React.useMemo(() => {
    if (!spec) return "";
    try {
      return openApiToJson(
        buildOpenApiDocument({
          spec,
          endpoints: specEndpoints,
          projectName,
        }),
      );
    } catch {
      return "{}";
    }
  }, [spec, specEndpoints, projectName]);

  const code = React.useMemo(() => {
    if (!spec) return null;
    return generateAllCode(spec, specEndpoints);
  }, [spec, specEndpoints]);

  if (specs.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon="🔌"
          title="No API defined yet"
          description="Create an API to design endpoints, generate an OpenAPI 3.1 document and export a typed client."
          action={
            canEdit ? (
              <Button size="sm" onClick={() => setSpecOpen(true)}>
                Define an API
              </Button>
            ) : undefined
          }
        />
        <SpecDialog
          projectId={projectId}
          spec={null}
          open={specOpen}
          onClose={() => {
            setSpecOpen(false);
            router.refresh();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {actionError ? <Alert tone="danger">{actionError}</Alert> : null}

      {/* spec selector */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={activeSpecId}
          onChange={(e) => setPreferredSpecId(e.target.value)}
          className="h-8 max-w-xs text-xs"
          aria-label="API specification"
        >
          {specs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} v{s.version}
            </option>
          ))}
        </Select>

        {spec ? (
          <span className="truncate font-mono text-[10px] text-muted-foreground">
            {spec.base_url}
          </span>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {canEdit ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setSpecOpen(true)}>
                API settings
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                New endpoint
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)}>
                Import Postman
              </Button>
            </>
          ) : null}

          {isAdmin ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => {
                const fd = new FormData();
                fd.set("projectId", projectId);
                fd.set("apiSpecId", activeSpecId);
                void deleteSpecAction(fd).then((result) => {
                  if (result.status === "error") {
                    setActionError(result.message);
                    return;
                  }
                  setActionError("");
                  setPreferredSpecId(null);
                  router.refresh();
                });
              }}
            >
              Delete API
            </Button>
          ) : null}
        </div>
      </div>

      {/* quality */}
      {issues.length > 0 ? (
        <Card className="p-3">
          <p className="text-xs font-medium">
            API quality: {issues.length} finding{issues.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-2 space-y-1">
            {issues.slice(0, 6).map((issue, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <Badge
                  tone={
                    issue.severity === "critical"
                      ? "danger"
                      : issue.severity === "high"
                        ? "warning"
                        : "muted"
                  }
                >
                  {issue.severity}
                </Badge>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
          {issues.length > 6 ? (
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              and {issues.length - 6} more
            </p>
          ) : null}
        </Card>
      ) : null}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "endpoints", label: "Endpoints", badge: specEndpoints.length },
          { id: "openapi", label: "OpenAPI" },
          { id: "client", label: "TypeScript client" },
          { id: "curl", label: "cURL" },
          { id: "mock", label: "Mock server" },
        ]}
      />

      {tab === "endpoints" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by path, summary or group…"
              className="h-8 max-w-xs text-xs"
            />
            <Select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="h-8 w-auto text-xs"
              aria-label="Filter by method"
            >
              <option value="all">All methods</option>
              {["get", "post", "put", "patch", "delete"].map((m) => (
                <option key={m} value={m}>
                  {m.toUpperCase()}
                </option>
              ))}
            </Select>
          </div>

          {grouped.length === 0 ? (
            <Card>
              <EmptyState
                icon="🛣️"
                title={specEndpoints.length === 0 ? "No endpoints yet" : "Nothing matches"}
                description={
                  specEndpoints.length === 0
                    ? "Add your first operation, or import an existing Postman collection."
                    : "Try a different search term or method filter."
                }
              />
            </Card>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </p>
                <div className="space-y-1.5">
                  {items.map((e) => (
                    <Card
                      key={e.id}
                      className="group flex flex-wrap items-center gap-3 px-3 py-2.5 transition-shadow hover:shadow-sm"
                    >
                      <MethodBadge method={e.method} />
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{e.path}</span>
                      {e.is_deprecated ? <Badge tone="muted">deprecated</Badge> : null}
                      <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
                        {e.summary || authLabel(e.auth_type)}
                      </span>

                      {canEdit ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditing(e);
                              setDialogOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              const fd = new FormData();
                              fd.set("projectId", projectId);
                              fd.set("apiSpecId", activeSpecId);
                              fd.set("endpointId", e.id);
                              void deleteEndpointAction(fd).then((result) => {
                                if (result.status === "error") {
                                  setActionError(result.message);
                                  return;
                                }
                                setActionError("");
                                router.refresh();
                              });
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      ) : null}
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === "openapi" && spec ? (
        <Card>
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="text-xs font-medium">openapi.json</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadText(`${spec.name.replace(/\s+/g, "-").toLowerCase()}.openapi.json`, openApiJson, "application/json")}
            >
              Download
            </Button>
          </div>
          <CodeBlock code={openApiJson} language="json" />
        </Card>
      ) : null}

      {tab === "client" && code ? (
        <Card>
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="text-xs font-medium">api-client.ts</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadText("api-client.ts", code.typescriptClient, "text/typescript")}
            >
              Download
            </Button>
          </div>
          <CodeBlock code={code.typescriptClient} language="typescript" />
        </Card>
      ) : null}

      {tab === "curl" && code ? (
        <Card>
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="text-xs font-medium">requests.sh</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadText("requests.sh", code.curl, "text/x-sh")}
            >
              Download
            </Button>
          </div>
          <CodeBlock code={code.curl} language="bash" />
        </Card>
      ) : null}

      {tab === "mock" && code ? (
        <Card>
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="text-xs font-medium">mock-server.ts</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadText("mock-server.ts", code.mockServer, "text/typescript")}
            >
              Download
            </Button>
          </div>
          <CodeBlock code={code.mockServer} language="typescript" />
        </Card>
      ) : null}

      {spec ? (
        <EndpointDialog
          // Remount per target so the form always initialises from the right
          // endpoint instead of being reset in an effect.
          key={`${spec.id}:${editing?.id ?? "new"}`}
          projectId={projectId}
          spec={spec}
          endpoint={editing}
          open={dialogOpen}
          onClose={() => {
            setDialogOpen(false);
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}

      {spec ? (
        <ImportPostmanDialog
          projectId={projectId}
          apiSpecId={spec.id}
          open={importOpen}
          onClose={() => {
            setImportOpen(false);
            router.refresh();
          }}
        />
      ) : null}

      <SpecDialog
        key={spec?.id ?? "new"}
        projectId={projectId}
        spec={spec}
        open={specOpen}
        onClose={() => {
          setSpecOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Postman import                                                     */
/* ------------------------------------------------------------------ */

function ImportPostmanDialog({
  projectId,
  apiSpecId,
  open,
  onClose,
}: {
  projectId: string;
  apiSpecId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [state, formAction] = React.useActionState<ActionState, FormData>(
    importPostmanAction,
    IDLE,
  );
  const [payload, setPayload] = React.useState("");
  const lastHandled = React.useRef("");

  // Close only once the import actually succeeded, never on click.
  React.useEffect(() => {
    if (state.status !== "success") return;
    if (lastHandled.current === state.message) return;
    lastHandled.current = state.message;
    onClose();
  }, [state, onClose]);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPayload(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import a Postman collection"
      description="Requests become endpoints you can refine. Existing endpoints are kept."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <ImportSubmit />
        </>
      }
    >
      <form id="import-postman-form" action={formAction} className="space-y-4">
        {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
        {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}

        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="apiSpecId" value={apiSpecId} />

        <Field label="Collection file" hint="Postman v2.1 JSON">
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
          />
        </Field>

        <Field label="Or paste the JSON" hint={payload ? `${payload.length} characters` : undefined}>
          <Textarea
            name="payload"
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={8}
            className="font-mono text-[11px]"
            placeholder='{ "info": { "name": "My API" }, "item": [ ... ] }'
          />
        </Field>
      </form>
    </Modal>
  );
}

function ImportSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" form="import-postman-form" loading={pending}>
      {pending ? "Importing…" : "Import"}
    </Button>
  );
}
