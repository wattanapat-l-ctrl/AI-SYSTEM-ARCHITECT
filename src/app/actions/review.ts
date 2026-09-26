"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProjectAccess } from "@/lib/auth";
import { actionError, actionSuccess, type ActionState } from "@/lib/utils";
import {
  REVIEW_SYSTEM_PROMPT,
  analyzeArchitecture,
  describeGraphForPrompt,
  type Graph,
  type GraphEdge,
  type GraphNode,
} from "@/lib/analysis";
import type { ReviewFinding, ReviewSeverity } from "@/lib/types";

const reviewSchema = z.object({
  projectId: z.string().min(1),
  diagramId: z.string().optional(),
});

/** formData.get() can return a File, so text fields are coerced explicitly. */
function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

const nodeSchema = z.object({
  id: z.string(),
  label: z.string().default(""),
  data: z.record(z.string(), z.unknown()).default({}),
});

const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  data: z.record(z.string(), z.unknown()).default({}),
});

function str(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function toGraph(nodes: unknown, edges: unknown): Graph {
  const safeNodes: GraphNode[] = z.array(nodeSchema).safeParse(nodes).success
    ? ((nodes as z.infer<typeof nodeSchema>[]) ?? []).map((n) => ({
        id: n.id,
        label: str(n.data, "label") ?? n.id,
        kind: str(n.data, "kind") ?? "service",
        layer: str(n.data, "layer") ?? "application",
        technology: str(n.data, "technology"),
        description: str(n.data, "description"),
        responsibility: str(n.data, "responsibility"),
        criticality: str(n.data, "criticality"),
        replication: str(n.data, "replication"),
        notes: str(n.data, "notes"),
        position: (n.data.__position as { x: number; y: number } | undefined) ?? undefined,
      }))
    : [];

  const safeEdges: GraphEdge[] = z.array(edgeSchema).safeParse(edges).success
    ? ((edges as z.infer<typeof edgeSchema>[]) ?? []).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        protocol: str(e.data, "protocol"),
        direction: str(e.data, "direction"),
        description: str(e.data, "description"),
        auth: str(e.data, "auth"),
        sla: str(e.data, "sla"),
        label: str(e.data, "label"),
      }))
    : [];

  return { nodes: safeNodes, edges: safeEdges };
}

const findingSchema = z.object({
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  title: z.string(),
  detail: z.string(),
  suggestion: z.string(),
  category: z.string(),
});

const llmResultSchema = z.object({
  score: z.number().min(0).max(100),
  summary: z.string(),
  findings: z.array(findingSchema).max(40),
});

type ReviewResult = {
  engine: "llm" | "rules";
  model: string;
  score: number;
  summary: string;
  findings: ReviewFinding[];
};

/**
 * Asks an OpenAI-compatible chat completion for a review. Returns null when no
 * key is configured or the request fails, so the caller can fall back to the
 * offline rules analyser instead of surfacing an error.
 */
async function runLlmReview(graph: Graph, projectName: string): Promise<ReviewResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: REVIEW_SYSTEM_PROMPT },
          { role: "user", content: describeGraphForPrompt(graph, projectName) },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) return null;

    const payload: unknown = await response.json();
    const content = (payload as { choices?: { message?: { content?: string } }[] })?.choices?.[0]
      ?.message?.content;
    if (!content) return null;

    const parsed = llmResultSchema.safeParse(JSON.parse(content));
    if (!parsed.success) return null;

    return {
      engine: "llm",
      model,
      score: Math.round(parsed.data.score),
      summary: parsed.data.summary,
      findings: parsed.data.findings as ReviewFinding[],
    };
  } catch {
    return null;
  }
}

export async function runArchitectureReviewAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = reviewSchema.safeParse({
    projectId: field(formData, "projectId"),
    diagramId: field(formData, "diagramId") || undefined,
  });
  if (!parsed.success) return actionError("Missing project.");

  const { projectId, diagramId } = parsed.data;
  const guard = await requireProjectAccess(projectId, "editor");
  if (!guard.ok) return actionError(guard.error);

  // Whole-project review analyses the newest version of every diagram.
  let query = guard.supabase
    .from("diagrams")
    .select("id, name")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  if (diagramId) query = query.eq("id", diagramId);

  const { data: diagrams, error: diagramError } = await query;
  if (diagramError) return actionError(diagramError.message);
  if (!diagrams?.length) return actionError("There are no diagrams to review yet.");

  const ids = diagrams.map((d) => d.id);
  const { data: versions, error: versionError } = await guard.supabase
    .from("diagram_versions")
    .select("diagram_id, version, nodes, edges")
    .in("diagram_id", ids);
  if (versionError) return actionError(versionError.message);

  // Keep only the highest version per diagram.
  const latest = new Map<string, { version: number; nodes: unknown; edges: unknown }>();
  for (const row of versions ?? []) {
    const current = latest.get(row.diagram_id);
    if (!current || row.version > current.version) {
      latest.set(row.diagram_id, { version: row.version, nodes: row.nodes, edges: row.edges });
    }
  }

  const nodes: unknown[] = [];
  const edges: unknown[] = [];
  for (const [diagramKey, value] of latest) {
    for (const raw of (Array.isArray(value.nodes) ? value.nodes : []) as Record<string, unknown>[]) {
      nodes.push({ ...raw, id: `${diagramKey}:${String(raw.id)}` });
    }
    for (const raw of (Array.isArray(value.edges) ? value.edges : []) as Record<string, unknown>[]) {
      // Edges are namespaced with the diagram id so cross-diagram linking
      // cannot accidentally join two unrelated components.
      edges.push({
        ...raw,
        id: `${diagramKey}:${String(raw.id)}`,
        source: `${diagramKey}:${String(raw.source)}`,
        target: `${diagramKey}:${String(raw.target)}`,
      });
    }
  }

  const graph = toGraph(nodes, edges);
  if (!graph.nodes.length) return actionError("The diagrams have no components to review.");

  const llm = await runLlmReview(graph, guard.project.name);
  const result: ReviewResult = llm ?? (() => {
    const analysis = analyzeArchitecture(graph);
    return {
      engine: "rules",
      model: "rules-v1",
      score: analysis.score,
      summary: analysis.summary,
      findings: analysis.findings,
    };
  })();

  const { error } = await guard.supabase.from("ai_reviews").insert({
    project_id: projectId,
    diagram_id: diagramId ?? null,
    engine: result.engine,
    model: result.model,
    score: result.score,
    summary: result.summary,
    findings: result.findings as unknown as Record<string, unknown>[],
    created_by: guard.userId,
  });

  if (error) return actionError(error.message);

  revalidatePath(`/projects/${projectId}/review`);
  return actionSuccess(
    result.engine === "llm"
      ? `Review complete (score ${result.score}/100).`
      : `Review complete using the offline rules engine (score ${result.score}/100). Set OPENAI_API_KEY for model-based reviews.`,
  );
}

export async function deleteReviewAction(formData: FormData): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const reviewId = String(formData.get("reviewId") ?? "");
  if (!projectId || !reviewId) return actionError("Missing project or review.");

  const guard = await requireProjectAccess(projectId, "editor");
  if (!guard.ok) return actionError(guard.error);

  const { error } = await guard.supabase
    .from("ai_reviews")
    .delete()
    .eq("id", reviewId)
    .eq("project_id", projectId);

  if (error) return actionError(error.message);

  revalidatePath(`/projects/${projectId}/review`);
  return actionSuccess("Review deleted.");
}

export type { ReviewSeverity };
