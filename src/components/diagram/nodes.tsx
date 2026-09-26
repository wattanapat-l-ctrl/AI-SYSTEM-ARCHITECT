"use client";

import * as React from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";

import { LAYER_MAP, NODE_KIND_MAP } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { DiagramEdgeData, DiagramNodeData, NodeLayer } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Per-kind accent colours (explicit map, no dynamic class strings)  */
/* ------------------------------------------------------------------ */

const TONE_STYLES: Record<string, { ring: string; chip: string; bar: string }> = {
  violet: {
    ring: "border-violet-400/60",
    chip: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
    bar: "bg-violet-500",
  },
  sky: {
    ring: "border-sky-400/60",
    chip: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
    bar: "bg-sky-500",
  },
  slate: {
    ring: "border-slate-400/60",
    chip: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
    bar: "bg-slate-500",
  },
  amber: {
    ring: "border-amber-400/60",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  indigo: {
    ring: "border-indigo-400/60",
    chip: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
    bar: "bg-indigo-500",
  },
  teal: {
    ring: "border-teal-400/60",
    chip: "bg-teal-500/15 text-teal-600 dark:text-teal-300",
    bar: "bg-teal-500",
  },
  emerald: {
    ring: "border-emerald-400/60",
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
  orange: {
    ring: "border-orange-400/60",
    chip: "bg-orange-500/15 text-orange-600 dark:text-orange-300",
    bar: "bg-orange-500",
  },
  rose: {
    ring: "border-rose-400/60",
    chip: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
    bar: "bg-rose-500",
  },
};

export type ComponentNode = Node<DiagramNodeData, "component">;
export type ConnectionEdge = Edge<DiagramEdgeData, "connection">;

/* ------------------------------------------------------------------ */
/*  Component node                                                    */
/* ------------------------------------------------------------------ */

export function ComponentNodeView({ data, selected }: NodeProps<ComponentNode>) {
  const meta = NODE_KIND_MAP[data.kind] ?? NODE_KIND_MAP.service;
  const tone = TONE_STYLES[meta.tone] ?? TONE_STYLES.indigo;
  const layer = LAYER_MAP[data.layer as NodeLayer];

  if (data.kind === "note") {
    return (
      <div
        className={cn(
          "w-56 rounded-lg border-2 border-dashed border-amber-400/70 bg-amber-500/10 p-2.5",
          selected && "ring-2 ring-ring",
        )}
      >
        <Handle type="target" position={Position.Top} />
        <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-foreground">
          {data.label || "Note"}
        </p>
        <Handle type="source" position={Position.Bottom} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-56 overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow",
        tone.ring,
        selected ? "ring-2 ring-ring shadow-lg" : "hover:shadow-md",
      )}
    >
      <div className={cn("h-1 w-full", tone.bar)} />

      <Handle type="target" position={Position.Left} />

      <div className="space-y-1.5 p-2.5">
        <div className="flex items-start gap-2">
          <span className="text-sm leading-none">{meta.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-tight">
              {data.label || meta.label}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {data.technology || meta.label}
            </p>
          </div>
        </div>

        {data.responsibility ? (
          <p className="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
            {data.responsibility}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          <span className={cn("rounded px-1 py-0.5 text-[9px] font-medium", tone.chip)}>
            {meta.label}
          </span>
          <span
            className="rounded px-1 py-0.5 text-[9px] font-medium"
            style={{
              backgroundColor: `${layer?.color ?? "#64748b"}1f`,
              color: layer?.color,
            }}
          >
            {layer?.label ?? data.layer}
          </span>
          {data.criticality === "high" ? (
            <span className="rounded bg-rose-500/15 px-1 py-0.5 text-[9px] font-medium text-rose-600 dark:text-rose-300">
              critical
            </span>
          ) : null}
        </div>
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Connection edge                                                   */
/* ------------------------------------------------------------------ */

const DIRECTION_DASH: Record<DiagramEdgeData["direction"], string | undefined> = {
  sync: undefined,
  async: "6 4",
  batch: "2 4",
  stream: "9 3 2 3",
};

const DIRECTION_COLOR: Record<DiagramEdgeData["direction"], string> = {
  sync: "var(--foreground)",
  async: "#0284c7",
  batch: "#d97706",
  stream: "#059669",
};

export function ConnectionEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  selected,
}: EdgeProps<ConnectionEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 14,
    offset: 24,
  });

  const direction = data?.direction ?? "sync";
  const caption =
    data?.label || [data?.protocol, direction !== "sync" ? direction : null].filter(Boolean).join(" ยท ");

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={18}
        style={{
          stroke: selected ? "var(--ring)" : DIRECTION_COLOR[direction],
          strokeWidth: selected ? 2.4 : 1.5,
          strokeDasharray: DIRECTION_DASH[direction],
        }}
      />

      {caption ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded border border-border bg-card/95 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground shadow-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              borderColor: selected ? "var(--ring)" : undefined,
              color: selected ? "var(--foreground)" : undefined,
            }}
          >
            {caption}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const diagramNodeTypes = { component: ComponentNodeView };
export const diagramEdgeTypes = { connection: ConnectionEdgeView };
