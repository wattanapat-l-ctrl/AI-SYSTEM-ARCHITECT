"use client";

import * as React from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { diagramEdgeTypes, diagramNodeTypes, type ComponentNode, type ConnectionEdge } from "./nodes";
import { CanvasStats, EdgeInspector, NodeInspector, NodePalette } from "./inspector";
import { Button, KeyHint, Select } from "@/components/ui";
import { LAYER_MAP, NODE_KIND_MAP } from "@/lib/constants";
import { cn, downloadText } from "@/lib/utils";
import { MarkerType } from "@xyflow/react";
import type { DiagramEdgeData, DiagramNodeData, NodeKind, NodeLayer } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Defaults                                                          */
/* ------------------------------------------------------------------ */

function defaultData(kind: NodeKind): DiagramNodeData {
  const meta = NODE_KIND_MAP[kind];
  return {
    label: meta?.defaultLabel ?? "Component",
    kind,
    layer: meta?.layer ?? "application",
    technology: "",
    description: "",
    responsibility: "",
    criticality: "medium",
    replication: "",
    notes: "",
  };
}

function defaultEdgeData(): DiagramEdgeData {
  return {
    protocol: "HTTPS",
    direction: "sync",
    description: "",
    auth: "",
    sla: "",
    label: "",
  };
}

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function toGraph(
  nodes: unknown[],
  edges: unknown[],
): { nodes: ComponentNode[]; edges: ConnectionEdge[] } {
  const safeNodes: ComponentNode[] = (Array.isArray(nodes) ? nodes : []).map((raw) => {
    const n = raw as {
      id?: string;
      position?: { x?: number; y?: number };
      data?: Partial<DiagramNodeData>;
    };
    return {
      id: String(n.id ?? uid("n")),
      type: "component" as const,
      position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
      data: { ...defaultData("service"), ...(n.data ?? {}) } as DiagramNodeData,
    };
  });

  const ids = new Set(safeNodes.map((n) => n.id));
  const safeEdges: ConnectionEdge[] = (Array.isArray(edges) ? edges : [])
    .map((raw) => {
      const e = raw as {
        id?: string;
        source?: string;
        target?: string;
        data?: Partial<DiagramEdgeData>;
      };
      return {
        id: String(e.id ?? uid("e")),
        source: String(e.source ?? ""),
        target: String(e.target ?? ""),
        type: "connection" as const,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        data: { ...defaultEdgeData(), ...(e.data ?? {}) } as DiagramEdgeData,
      };
    })
    .filter((e) => ids.has(e.source) && ids.has(e.target));

  return { nodes: safeNodes, edges: safeEdges };
}

/* ------------------------------------------------------------------ */
/*  Autosave status                                                   */
/* ------------------------------------------------------------------ */

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/* ------------------------------------------------------------------ */
/*  The canvas                                                        */
/* ------------------------------------------------------------------ */

function DiagramCanvasInner({
  diagramId,
  initialNodes,
  initialEdges,
  initialViewport,
  readOnly,
  version,
  onSave,
  onDirtyChange,
}: {
  diagramId: string;
  initialNodes: unknown[];
  initialEdges: unknown[];
  initialViewport: Viewport | null;
  readOnly: boolean;
  version: number;
  onSave: (payload: {
    nodes: unknown[];
    edges: unknown[];
    viewport: Viewport;
    notes: string;
  }) => Promise<{ ok: boolean; message: string }>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const initial = React.useMemo(() => toGraph(initialNodes, initialEdges), [initialNodes, initialEdges]);

  const [nodes, setNodes] = React.useState<ComponentNode[]>(initial.nodes);
  const [edges, setEdges] = React.useState<ConnectionEdge[]>(initial.edges);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [leftTab, setLeftTab] = React.useState<"palette" | "layers">("palette");
  const [autoSave, setAutoSave] = React.useState(false);

  const { screenToFlowPosition, fitView, getViewport } = useReactFlow();

  const isDirty = React.useRef(false);
  const markDirty = React.useCallback(() => {
    isDirty.current = true;
    setSaveState("dirty");
    onDirtyChange?.(true);
  }, [onDirtyChange]);

  /* ---- selection ---- */
  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const selectedEdge = edges.find((e) => e.id === selectedId) ?? null;

  /* ---- handlers ---- */
  const onNodesChange = React.useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds) as ComponentNode[]);
      const structural = changes.some((c) => c.type !== "select" && c.type !== "dimensions");
      if (structural) markDirty();
    },
    [markDirty],
  );

  const onEdgesChange = React.useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds) as ConnectionEdge[]);
      const structural = changes.some((c) => c.type !== "select");
      if (structural) markDirty();
    },
    [markDirty],
  );

  const onConnect = React.useCallback(
    (connection: Connection) => {
      const edge: ConnectionEdge = {
        ...connection,
        id: uid("e"),
        type: "connection",
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        data: defaultEdgeData(),
      };
      setEdges((eds) => addEdge<ConnectionEdge>(edge, eds));
      markDirty();
    },
    [markDirty],
  );

  const addNode = React.useCallback(
    (kind: NodeKind) => {
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });

      const id = uid("n");
      const node: ComponentNode = {
        id,
        type: "component",
        position: {
          x: center.x - 112 + (Math.random() * 40 - 20),
          y: center.y - 50 + (Math.random() * 40 - 20),
        },
        data: { ...defaultData(kind) },
      };

      setNodes((nds) => [...nds, node]);
      setSelectedId(id);
      markDirty();
    },
    [markDirty, screenToFlowPosition],
  );

  const updateNode = React.useCallback(
    (patch: Partial<DiagramNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
      markDirty();
    },
    [selectedId, markDirty],
  );

  const updateEdge = React.useCallback(
    (patch: Partial<DiagramEdgeData>) => {
      setEdges((eds) =>
        eds.map((e) =>
          e.id === selectedId
            ? { ...e, data: { ...(e.data ?? ({} as DiagramEdgeData)), ...patch } as DiagramEdgeData }
            : e,
        ),
      );
      markDirty();
    },
    [selectedId, markDirty],
  );

  const removeSelected = React.useCallback(() => {
    if (!selectedId || readOnly) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
    markDirty();
  }, [selectedId, readOnly, markDirty]);

  /* ---- keyboard ---- */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        removeSelected();
      }
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, removeSelected]);

  /* ---- save ---- */
  const save = React.useCallback(
    async (releaseNote?: string) => {
      if (readOnly) return { ok: false, message: "Read-only access." };
      setSaveState("saving");
      const result = await onSave({
        nodes: nodes.map((n) => ({
          id: n.id,
          position: { x: n.position.x, y: n.position.y },
          data: n.data,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          data: (e.data ?? {}) as object,
        })),
        viewport: getViewport(),
        notes: releaseNote ?? notes,
      });
      setSaveState(result.ok ? "saved" : "error");
      setSaveMessage(result.message);
      if (result.ok) {
        isDirty.current = false;
        onDirtyChange?.(false);
      }
      return result;
    },
    [nodes, edges, getViewport, notes, onSave, readOnly, onDirtyChange],
  );

  /* ---- autosave ---- */
  React.useEffect(() => {
    if (!autoSave || readOnly) return;
    if (saveState !== "dirty") return;
    const timer = setTimeout(() => {
      void save("Autosave");
    }, 4000);
    return () => clearTimeout(timer);
  }, [autoSave, saveState, save, readOnly]);

  /* ---- beforeunload guard ---- */
  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  /* ---- derived ---- */
  const byLayer = React.useMemo(() => {
    const out: Record<string, number> = {};
    for (const n of nodes) out[n.data.layer] = (out[n.data.layer] ?? 0) + 1;
    return out;
  }, [nodes]);

  const exportPayload = React.useMemo(
    () => ({
      nodes: nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, data: e.data })),
      viewport: getViewport(),
    }),
    [nodes, edges, getViewport],
  );

  const saveLabel =
    saveState === "saving"
      ? "Saving\u2026"
      : saveState === "saved"
        ? `Saved v${version}`
        : saveState === "error"
          ? "Save failed"
          : saveState === "dirty"
            ? "Unsaved changes"
            : `v${version}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <CanvasStats nodeCount={nodes.length} edgeCount={edges.length} byLayer={byLayer} />

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-md px-2 py-1 text-[10px] font-medium",
              saveState === "dirty"
                ? "bg-warning/15 text-warning"
                : saveState === "error"
                  ? "bg-destructive/15 text-destructive"
                  : saveState === "saved"
                    ? "bg-success/15 text-success"
                    : "bg-secondary text-muted-foreground",
            )}
            title={saveMessage}
          >
            {saveLabel}
          </span>

          {!readOnly ? (
            <>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[10px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={autoSave}
                  onChange={(e) => setAutoSave(e.target.checked)}
                  className="h-3 w-3 accent-primary"
                />
                Autosave
              </label>

              <Select
                value=""
                onChange={(e) => {
                  if (e.target.value === "fit") fitView({ padding: 0.2, duration: 400 });
                  if (e.target.value === "tidy") {
                    // Snap components onto a coarse grid for a tidier layout.
                    setNodes((nds) =>
                      nds.map((n) => ({
                        ...n,
                        position: {
                          x: Math.round(n.position.x / 24) * 24,
                          y: Math.round(n.position.y / 24) * 24,
                        },
                      })),
                    );
                    markDirty();
                  }
                  if (e.target.value === "export") {
                    downloadText(
                      `diagram-${diagramId}.json`,
                      JSON.stringify(exportPayload, null, 2),
                      "application/json",
                    );
                  }
                  if (e.target.value === "clear") {
                    setNodes([]);
                    setEdges([]);
                    setSelectedId(null);
                    markDirty();
                  }
                }}
                className="h-7 w-auto text-[10px]"
                aria-label="Canvas actions"
              >
                <option value="">Actions\u2026</option>
                <option value="fit">Fit to view</option>
                <option value="tidy">Snap to grid</option>
                <option value="export">Export JSON</option>
                <option value="clear">Clear canvas</option>
              </Select>

              <Button size="sm" onClick={() => void save()} loading={saveState === "saving"}>
                Save version
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* body */}
      <div className="flex min-h-0 flex-1">
        {/* palette */}
        {!readOnly ? (
          <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-card lg:flex">
            <div className="flex border-b border-border">
              <TabBtn active={leftTab === "palette"} onClick={() => setLeftTab("palette")}>
                Palette
              </TabBtn>
              <TabBtn active={leftTab === "layers"} onClick={() => setLeftTab("layers")}>
                Layers
              </TabBtn>
            </div>
            {leftTab === "palette" ? (
              <NodePalette onAdd={addNode} />
            ) : (
              <LayerBreakdown byLayer={byLayer} total={nodes.length} />
            )}
          </aside>
        ) : null}

        {/* canvas */}
        <div className="relative min-w-0 flex-1 bg-background">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={diagramNodeTypes}
            edgeTypes={diagramEdgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onEdgeClick={(_, e) => setSelectedId(e.id)}
            onPaneClick={() => setSelectedId(null)}
            defaultViewport={initialViewport ?? undefined}
            fitView={initialViewport ? false : true}
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.15}
            maxZoom={2.5}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            elementsSelectable={!readOnly}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: "connection",
              markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
              style: { strokeWidth: 1.5 },
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              className="!h-20 !w-32"
              nodeColor={(n) =>
                LAYER_MAP[(n.data as DiagramNodeData).layer as NodeLayer]?.color ?? "#64748b"
              }
              maskColor="rgb(0 0 0 / 0.12)"
            />
          </ReactFlow>

          {nodes.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="pointer-events-auto max-w-xs rounded-xl border border-dashed border-border bg-card/90 px-5 py-6 text-center backdrop-blur">
                <p className="text-2xl">{readOnly ? "\u{1F441}" : "\u{1F5A5}"}</p>
                <p className="mt-2 text-sm font-medium">
                  {readOnly ? "This diagram is empty" : "Add your first component"}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {readOnly
                    ? "The designer is read-only for your role."
                    : "Click a component in the palette on the left, then connect the handles to build the request path."}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* inspector */}
        {selectedNode || selectedEdge ? (
          <aside className="hidden w-64 shrink-0 flex-col border-l border-border bg-card xl:flex">
            {selectedNode ? (
              <NodeInspector
                node={{ id: selectedNode.id, ...selectedNode.data }}
                onChange={updateNode}
                onDelete={removeSelected}
              />
            ) : selectedEdge ? (
              <EdgeInspector
                edge={selectedEdge.data as DiagramEdgeData}
                onChange={updateEdge}
                onDelete={removeSelected}
              />
            ) : null}
          </aside>
        ) : null}
      </div>

      {/* footer hints */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border bg-card px-3 py-1.5 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          Drag a handle to connect <KeyHint>Del</KeyHint> to remove selection
        </span>
        <span className="flex items-center gap-1">
          <KeyHint>Esc</KeyHint> deselect
        </span>

        {!readOnly ? (
          <label className="ml-auto flex min-w-0 flex-1 items-center gap-1.5 sm:max-w-md">
            <span className="shrink-0 text-[10px] text-muted-foreground">Version note</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What changed in this version?"
              maxLength={200}
              className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-[10px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </label>
        ) : null}

        {saveState === "error" && saveMessage ? (
          <span className="shrink-0 text-destructive">{saveMessage}</span>
        ) : null}
        {saveState === "saved" ? <span className="shrink-0 text-success">{saveMessage}</span> : null}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 border-b-2 px-2 py-2 text-[10px] font-medium transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function LayerBreakdown({
  byLayer,
  total,
}: {
  byLayer: Record<string, number>;
  total: number;
}) {
  return (
    <div className="flex-1 space-y-1 overflow-y-auto p-2">
      {total === 0 ? (
        <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">No components yet.</p>
      ) : null}

      {Object.entries(LAYER_MAP).map(([id, layer]) => {
        const count = byLayer[id] ?? 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={id} className="rounded-lg px-2 py-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: layer.color }}
                />
                {layer.label}
              </span>
              <span className="tabular-nums text-muted-foreground">{count}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: layer.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Provider wrapper                                                  */
/* ------------------------------------------------------------------ */

export function DiagramCanvas(props: React.ComponentProps<typeof DiagramCanvasInner>) {
  return (
    <ReactFlowProvider>
      <DiagramCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
