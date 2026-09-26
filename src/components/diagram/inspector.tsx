"use client";

import * as React from "react";
import { Badge, Input, Label, Select, Textarea } from "@/components/ui";
import {
  COMMON_PROTOCOLS,
  CRITICALITY_OPTIONS,
  LAYERS,
  LAYER_MAP,
  NODE_KINDS,
  NODE_KIND_MAP,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { DiagramEdgeData, DiagramNodeData, NodeKind, NodeLayer } from "@/lib/types";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5 border-b border-border px-4 py-3.5 last:border-b-0">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/* ================================================================== */
/*  Node inspector                                                    */
/* ================================================================== */

export function NodeInspector({
  node,
  onChange,
  onDelete,
}: {
  node: DiagramNodeData & { id: string };
  onChange: (patch: Partial<DiagramNodeData>) => void;
  onDelete: () => void;
}) {
  const meta = NODE_KIND_MAP[node.kind] ?? NODE_KIND_MAP.service;
  const layer = LAYER_MAP[node.layer];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="text-base">{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{node.label || meta.label}</p>
          <p className="truncate text-[10px] text-muted-foreground">{meta.label}</p>
        </div>
        <button
          onClick={onDelete}
          title="Delete component"
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <Group title="Identity">
          <Row label="Name">
            <Input
              value={node.label}
              onChange={(e) => onChange({ label: e.target.value })}
              className="h-8 text-xs"
              placeholder="Component name"
            />
          </Row>

          <Row label="Type">
            <Select
              value={node.kind}
              onChange={(e) => onChange({ kind: e.target.value as NodeKind })}
              className="h-8 text-xs"
            >
              {NODE_KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.icon} {k.label}
                </option>
              ))}
            </Select>
          </Row>

          <Row label="Architectural layer">
            <Select
              value={node.layer}
              onChange={(e) => onChange({ layer: e.target.value as NodeLayer })}
              className="h-8 text-xs"
            >
              {LAYERS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
            <p className="text-[10px] leading-relaxed text-muted-foreground">{layer?.description}</p>
          </Row>
        </Group>

        <Group title="Details">
          <Row label="Technology">
            <Input
              value={node.technology}
              onChange={(e) => onChange({ technology: e.target.value })}
              className="h-8 text-xs"
              placeholder="Node 22, PostgreSQL 16, Redis"
            />
          </Row>

          <Row label="Responsibility">
            <Textarea
              value={node.responsibility}
              onChange={(e) => onChange({ responsibility: e.target.value })}
              rows={3}
              className="text-xs"
              placeholder="What this component is responsible for"
            />
          </Row>

          <Row label="Description">
            <Textarea
              value={node.description}
              onChange={(e) => onChange({ description: e.target.value })}
              rows={3}
              className="text-xs"
              placeholder="Extra context shown to reviewers"
            />
          </Row>

          <Row label="Criticality">
            <div className="flex gap-1.5">
              {CRITICALITY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => onChange({ criticality: opt.id })}
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors",
                    node.criticality === opt.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Replication / failover">
            <Textarea
              value={node.replication}
              onChange={(e) => onChange({ replication: e.target.value })}
              rows={2}
              className="text-xs"
              placeholder="Primary + 2 read replicas across AZs"
            />
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Required for high-criticality components, otherwise the reviewer flags a single point
              of failure.
            </p>
          </Row>

          <Row label="Notes">
            <Textarea
              value={node.notes}
              onChange={(e) => onChange({ notes: e.target.value })}
              rows={3}
              className="text-xs"
              placeholder="Metrics, alerts, SLOs, runbook links"
            />
          </Row>
        </Group>

        <Group title="Type reference">
          <p className="text-[10px] leading-relaxed text-muted-foreground">{meta.description}</p>
        </Group>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Edge inspector                                                    */
/* ================================================================== */

export function EdgeInspector({
  edge,
  onChange,
  onDelete,
}: {
  edge: DiagramEdgeData;
  onChange: (patch: Partial<DiagramEdgeData>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="text-base">{"\u{1F517}"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">Connection</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {edge.protocol || "no protocol"} {"\u00b7"} {edge.direction}
          </p>
        </div>
        <button
          onClick={onDelete}
          title="Delete connection"
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <Group title="Contract">
          <Row label="Protocol">
            <>
              <Input
                value={edge.protocol}
                onChange={(e) => onChange({ protocol: e.target.value })}
                className="h-8 text-xs"
                placeholder="HTTPS"
                list="protocols"
              />
              <datalist id="protocols">
                {COMMON_PROTOCOLS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </>
          </Row>

          <Row label="Mode">
            <div className="flex flex-wrap gap-1.5">
              {(["sync", "async", "batch", "stream"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => onChange({ direction: d })}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[10px] font-medium capitalize transition-colors",
                    edge.direction === d
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Edge label">
            <Input
              value={edge.label}
              onChange={(e) => onChange({ label: e.target.value })}
              className="h-8 text-xs"
              placeholder="Shown on the diagram"
            />
          </Row>
        </Group>

        <Group title="Non-functional">
          <Row label="Authentication">
            <Input
              value={edge.auth}
              onChange={(e) => onChange({ auth: e.target.value })}
              className="h-8 text-xs"
              placeholder="OAuth2 client credentials, mTLS"
            />
          </Row>

          <Row label="SLA">
            <Input
              value={edge.sla}
              onChange={(e) => onChange({ sla: e.target.value })}
              className="h-8 text-xs"
              placeholder="p99 < 200ms, 99.95% availability"
            />
          </Row>

          <Row label="Notes">
            <Textarea
              value={edge.description}
              onChange={(e) => onChange({ description: e.target.value })}
              rows={3}
              className="text-xs"
              placeholder="What flows over this connection and why"
            />
          </Row>
        </Group>

        <Group title="Help">
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Async, batch and stream connections render with a dashed line so reviewers can see which
            paths are off the critical request path.
          </p>
        </Group>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Node palette                                                      */
/* ================================================================== */

export function NodePalette({ onAdd }: { onAdd: (kind: NodeKind) => void }) {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NODE_KINDS;
    return NODE_KINDS.filter(
      (k) =>
        k.label.toLowerCase().includes(q) ||
        k.description.toLowerCase().includes(q) ||
        k.tags.some((t) => t.includes(q)),
    );
  }, [query]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search components\u2026"
          className="h-8 text-xs"
        />
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {filtered.map((k) => (
          <button
            key={k.kind}
            onClick={() => onAdd(k.kind)}
            className="group flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary"
            title={k.description}
          >
            <span className="mt-0.5 text-sm leading-none">{k.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{k.label}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                {k.description}
              </span>
            </span>
          </button>
        ))}

        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">
            No component matches &ldquo;{query}&rdquo;.
          </p>
        ) : null}
      </div>

      <div className="border-t border-border p-3">
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Click to add to the canvas centre, then drag it into place. Select a node to edit it in the
          inspector.
        </p>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Canvas statistics strip                                           */
/* ================================================================== */

export function CanvasStats({
  nodeCount,
  edgeCount,
  byLayer,
}: {
  nodeCount: number;
  edgeCount: number;
  byLayer: Record<string, number>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone="muted">
        {nodeCount} component{nodeCount === 1 ? "" : "s"}
      </Badge>
      <Badge tone="muted">
        {edgeCount} connection{edgeCount === 1 ? "" : "s"}
      </Badge>
      {LAYERS.filter((l) => byLayer[l.id]).map((l) => (
        <span
          key={l.id}
          className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: `${l.color}1f`, color: l.color }}
        >
          {l.short} {byLayer[l.id]}
        </span>
      ))}
    </div>
  );
}
