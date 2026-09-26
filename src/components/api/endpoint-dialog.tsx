"use client";

import * as React from "react";

import { useFormStatus } from "react-dom";
import {
  Alert,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import { IDLE, type ActionState } from "@/lib/utils";
import { authLabel, defaultRateLimit, methodColor } from "@/lib/openapi";
import { parseTags, parseList } from "@/lib/utils";
import type { ApiEndpoint, ApiErrorDef, ApiParam, ApiSpec } from "@/lib/types";
import { createEndpointAction, updateEndpointAction } from "@/app/actions/api";

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;
const AUTH_TYPES = ["none", "bearer", "basic", "apikey", "oauth2", "mtls"] as const;
const PARAM_LOCATIONS = ["query", "header", "path", "cookie"] as const;

const STATUS_PRESETS: { status: string; description: string }[] = [
  { status: "200", description: "OK" },
  { status: "201", description: "Created" },
  { status: "204", description: "No Content" },
  { status: "400", description: "Bad Request" },
  { status: "401", description: "Unauthorized" },
  { status: "403", description: "Forbidden" },
  { status: "404", description: "Not Found" },
  { status: "409", description: "Conflict" },
  { status: "422", description: "Unprocessable Entity" },
  { status: "429", description: "Too Many Requests" },
  { status: "500", description: "Internal Server Error" },
];

const ERROR_PRESETS: ApiErrorDef[] = [
  { code: "VALIDATION_ERROR", description: "The request body failed validation.", httpStatus: 422 },
  { code: "UNAUTHORIZED", description: "Missing or invalid credentials.", httpStatus: 401 },
  { code: "FORBIDDEN", description: "The caller lacks permission.", httpStatus: 403 },
  { code: "NOT_FOUND", description: "The resource does not exist.", httpStatus: 404 },
  { code: "CONFLICT", description: "The request conflicts with current state.", httpStatus: 409 },
  { code: "RATE_LIMITED", description: "Too many requests.", httpStatus: 429 },
];

/* ------------------------------------------------------------------ */
/*  JSON editing helper                                                */
/* ------------------------------------------------------------------ */

function JsonField({
  label,
  hint,
  value,
  onChange,
  rows = 5,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
}) {
  const [error, setError] = React.useState("");

  return (
    <Field label={label} hint={hint} error={error || undefined}>
      <Textarea
        value={value}
        rows={rows}
        className="font-mono text-[11px]"
        onChange={(e) => {
          onChange(e.target.value);
          if (error) {
            try {
              JSON.parse(e.target.value || "null");
              setError("");
            } catch {
              /* keep the previous error until it becomes valid */
            }
          }
        }}
        onBlur={() => {
          if (value.trim() === "") {
            setError("");
            return;
          }
          try {
            JSON.parse(value);
            setError("");
          } catch {
            setError("Not valid JSON.");
          }
        }}
      />
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/*  Endpoint dialog                                                    */
/* ------------------------------------------------------------------ */

export function EndpointDialog({
  projectId,
  spec,
  endpoint,
  open,
  onClose,
}: {
  projectId: string;
  spec: ApiSpec;
  endpoint: ApiEndpoint | null;
  open: boolean;
  onClose: () => void;
}) {
  const isEdit = Boolean(endpoint);

  const [state, formAction] = React.useActionState<ActionState, FormData>(
    isEdit ? updateEndpointAction : createEndpointAction,
    IDLE,
  );

  const [method, setMethod] = React.useState(endpoint?.method ?? "get");
  const [path, setPath] = React.useState(endpoint?.path ?? "/");
  const [groupName, setGroupName] = React.useState(endpoint?.group_name ?? "default");
  const [summary, setSummary] = React.useState(endpoint?.summary ?? "");
  const [description, setDescription] = React.useState(endpoint?.description ?? "");
  const [authType, setAuthType] = React.useState(endpoint?.auth_type ?? "bearer");
  const [rateLimit, setRateLimit] = React.useState(endpoint?.rate_limit ?? "");
  const [tags, setTags] = React.useState((endpoint?.tags ?? []).join(", "));
  const [isDeprecated, setIsDeprecated] = React.useState(endpoint?.is_deprecated ?? false);
  const [tab, setTab] = React.useState<"details" | "params" | "body" | "responses" | "errors">(
    "details",
  );

  const [params, setParams] = React.useState<ApiParam[]>(endpoint?.params ?? []);
  const [requestBody, setRequestBody] = React.useState(
    endpoint?.request_body ? JSON.stringify(endpoint.request_body, null, 2) : "",
  );
  const [responses, setResponses] = React.useState(
    endpoint?.responses ? JSON.stringify(endpoint.responses, null, 2) : "",
  );
  const [errors, setErrors] = React.useState<ApiErrorDef[]>(endpoint?.errors ?? []);

  const preview = `${spec.base_url}${path.startsWith("/") ? path : `/${path}`}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${endpoint?.method.toUpperCase()} ${endpoint?.path}` : "New endpoint"}
      description={isEdit ? undefined : "Describe one operation; the OpenAPI document builds itself."}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <EndpointSubmit isEdit={isEdit} />
        </>
      }
    >
      <form
        id="endpoint-form"
        action={formAction}
        onSubmit={() => undefined}
        className="space-y-4"
      >
        {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}

        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="apiSpecId" value={spec.id} />
        {endpoint ? <input type="hidden" name="endpointId" value={endpoint.id} /> : null}
        <input type="hidden" name="method" value={method} />
        <input type="hidden" name="path" value={path} />
        <input type="hidden" name="groupName" value={groupName} />
        <input type="hidden" name="summary" value={summary} />
        <input type="hidden" name="description" value={description} />
        <input type="hidden" name="authType" value={authType} />
        <input type="hidden" name="rateLimit" value={rateLimit} />
        <input type="hidden" name="tags" value={JSON.stringify(parseTags(tags))} />
        <input
          type="hidden"
          name="isDeprecated"
          value={isDeprecated ? "true" : "false"}
        />
        <input type="hidden" name="params" value={JSON.stringify(params)} />
        <input type="hidden" name="requestBody" value={requestBody} />
        <input type="hidden" name="responses" value={responses} />
        <input type="hidden" name="errors" value={JSON.stringify(errors)} />
        <input
          type="hidden"
          name="operationId"
          value={endpoint?.operation_id ?? ""}
        />

        {/* method + path */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
            className="sm:w-32"
            aria-label="HTTP method"
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m.toUpperCase()}
              </option>
            ))}
          </Select>
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/orders/{orderId}"
            className="font-mono text-xs"
          />
        </div>

        <p className="truncate font-mono text-[10px] text-muted-foreground">{preview}</p>

        {/* tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-border">
          {(
            [
              ["details", "Details"],
              ["params", `Parameters (${params.length})`],
              ["body", "Request body"],
              ["responses", "Responses"],
              ["errors", `Errors (${errors.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={
                tab === id
                  ? "border-b-2 border-primary px-2.5 py-1.5 text-xs font-medium text-primary"
                  : "border-b-2 border-transparent px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              }
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "details" ? (
          <div className="space-y-3.5">
            <Field label="Summary" error={state.fieldErrors?.summary}>
              <Input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Fetch a single order"
              />
            </Field>

            <Field label="Description">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What this operation does and any important behaviour"
              />
            </Field>

            <div className="grid gap-3.5 sm:grid-cols-3">
              <Field label="Group" hint="used for OpenAPI tags">
                <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} />
              </Field>

              <Field label="Authentication" hint={authLabel(authType)}>
                <Select
                  value={authType}
                  onChange={(e) => setAuthType(e.target.value as typeof authType)}
                >
                  {AUTH_TYPES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Rate limit" hint="e.g. 100/min">
                <Input
                  value={rateLimit}
                  onChange={(e) => setRateLimit(e.target.value)}
                  placeholder={defaultRateLimit(method)}
                />
              </Field>
            </div>

            <Field label="Tags" hint="comma separated">
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="orders, internal"
              />
            </Field>

            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={isDeprecated}
                onChange={(e) => setIsDeprecated(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              Mark as deprecated
            </label>
          </div>
        ) : null}

        {tab === "params" ? (
          <ParamEditor params={params} onChange={setParams} />
        ) : null}

        {tab === "body" ? (
          <div className="space-y-3">
            <JsonField
              label="Request body (JSON Schema)"
              hint="Leave empty for GET, HEAD and DELETE."
              value={requestBody}
              onChange={setRequestBody}
              rows={10}
            />
            {method === "get" && requestBody.trim() !== "" ? (
              <Alert tone="warning">
                A GET operation should not define a request body. Most clients ignore it.
              </Alert>
            ) : null}
          </div>
        ) : null}

        {tab === "responses" ? (
          <div className="space-y-3">
            <JsonField
              label="Responses"
              hint='Keyed by status code, e.g. {"200": {"description": "OK", "schema": {...}}}'
              value={responses}
              onChange={setResponses}
              rows={10}
            />
            <div className="flex flex-wrap gap-1.5">
              {STATUS_PRESETS.filter((p) => !(p.status in safeParse(responses))).map((p) => (
                <button
                  key={p.status}
                  type="button"
                  onClick={() => {
                    const current = safeParse(responses);
                    setResponses(
                      JSON.stringify(
                        {
                          ...current,
                          [p.status]: { description: p.description },
                        },
                        null,
                        2,
                      ),
                    );
                  }}
                  className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary"
                >
                  + {p.status}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "errors" ? (
          <ErrorEditor errors={errors} onChange={setErrors} />
        ) : null}
      </form>
    </Modal>
  );
}

function safeParse(value: string): Record<string, unknown> {
  if (value.trim() === "") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function EndpointSubmit({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" form="endpoint-form" loading={pending}>
      {pending ? "Savingโ€ฆ" : isEdit ? "Save endpoint" : "Create endpoint"}
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/*  Parameter editor                                                   */
/* ------------------------------------------------------------------ */

function ParamEditor({
  params,
  onChange,
}: {
  params: ApiParam[];
  onChange: (next: ApiParam[]) => void;
}) {
  const update = (i: number, patch: Partial<ApiParam>) =>
    onChange(params.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  return (
    <div className="space-y-2">
      {params.map((p, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-2.5 sm:flex-row">
          <Input
            value={p.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="orderId"
            className="sm:w-40"
          />
          <Select
            value={p.in}
            onChange={(e) => update(i, { in: e.target.value as ApiParam["in"] })}
            className="sm:w-28"
          >
            {PARAM_LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </Select>
          <Input
            value={p.type}
            onChange={(e) => update(i, { type: e.target.value })}
            placeholder="string"
            className="sm:w-28"
          />
          <Input
            value={p.description}
            onChange={(e) => update(i, { description: e.target.value })}
            placeholder="Description"
            className="flex-1"
          />
          <label className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
            <input
              type="checkbox"
              checked={p.required}
              onChange={(e) => update(i, { required: e.target.checked })}
              className="h-3.5 w-3.5 accent-primary"
            />
            required
          </label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0 text-destructive hover:bg-destructive/10"
            onClick={() => onChange(params.filter((_, idx) => idx !== i))}
          >
            Remove
          </Button>
        </div>
      ))}

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          onChange([
            ...params,
            { name: "", in: "query", required: false, type: "string", description: "" },
          ])
        }
      >
        Add parameter
      </Button>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Path parameters should match the placeholders in the path, for example{" "}
        <code className="font-mono">{"{orderId}"}</code>. The quality checker warns when they drift
        apart.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Error editor                                                       */
/* ------------------------------------------------------------------ */

function ErrorEditor({
  errors,
  onChange,
}: {
  errors: ApiErrorDef[];
  onChange: (next: ApiErrorDef[]) => void;
}) {
  const toggle = (preset: ApiErrorDef) => {
    const exists = errors.some((e) => e.code === preset.code);
    onChange(
      exists
        ? errors.filter((e) => e.code !== preset.code)
        : [...errors, { ...preset, description: "" }],
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {ERROR_PRESETS.map((preset) => {
          const active = errors.some((e) => e.code === preset.code);
          return (
            <button
              key={preset.code}
              type="button"
              onClick={() => toggle(preset)}
              className={
                active
                  ? "rounded border border-primary bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary"
                  : "rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-secondary"
              }
            >
              {preset.httpStatus} {preset.code}
            </button>
          );
        })}
      </div>

      {errors.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No error contract yet. Pick the failures this operation can return so the generated client
          can handle them.
        </p>
      ) : null}

      {errors.map((e, i) => (
        <div key={e.code} className="flex flex-col gap-2 rounded-lg border border-border p-2.5 sm:flex-row">
          <Input value={e.code} onChange={(ev) => onChange(errors.map((x, idx) => (idx === i ? { ...x, code: ev.target.value } : x)))} className="sm:w-44" />
          <Input
            value={e.httpStatus}
            onChange={(ev) =>
              onChange(
                errors.map((x, idx) =>
                  idx === i ? { ...x, httpStatus: Number(ev.target.value) || 400 } : x,
                ),
              )
            }
            type="number"
            className="sm:w-24"
          />
          <Input
            value={e.description}
            onChange={(ev) => onChange(errors.map((x, idx) => (idx === i ? { ...x, description: ev.target.value } : x)))}
            placeholder="Description"
            className="flex-1"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0 text-destructive hover:bg-destructive/10"
            onClick={() => onChange(errors.filter((_, idx) => idx !== i))}
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Method badge                                                       */
/* ------------------------------------------------------------------ */

export function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
      style={{ backgroundColor: `${methodColor(method)}22`, color: methodColor(method) }}
    >
      {method.toUpperCase()}
    </span>
  );
}

export { parseList };
