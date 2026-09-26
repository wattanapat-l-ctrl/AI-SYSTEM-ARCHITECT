import type { ReviewFinding, ReviewSeverity } from "./types";
import { NODE_KIND_MAP } from "./constants";

/* ------------------------------------------------------------------ */
/*  Shape of the graph as the analyser sees it                        */
/* ------------------------------------------------------------------ */

export interface GraphNode {
  id: string;
  label: string;
  kind: string;
  layer: string;
  technology?: string;
  description?: string;
  responsibility?: string;
  criticality?: string;
  replication?: string;
  notes?: string;
  position?: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  protocol?: string;
  direction?: string;
  description?: string;
  auth?: string;
  sla?: string;
  label?: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface AnalysisResult {
  score: number;
  summary: string;
  findings: ReviewFinding[];
  metrics: {
    nodeCount: number;
    edgeCount: number;
    layerCoverage: string[];
    externalCount: number;
    datastoreCount: number;
    isolatedNodes: number;
    cycles: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function finding(
  severity: ReviewSeverity,
  title: string,
  detail: string,
  suggestion: string,
  category: string,
): ReviewFinding {
  return { severity, title, detail, suggestion, category };
}

function kindTags(node: GraphNode): string[] {
  return NODE_KIND_MAP[node.kind as keyof typeof NODE_KIND_MAP]?.tags ?? [];
}

function hasTag(node: GraphNode, tag: string): boolean {
  return kindTags(node).includes(tag);
}

function byKind(graph: Graph, ...kinds: string[]): GraphNode[] {
  return graph.nodes.filter((n) => kinds.includes(n.kind));
}

function outgoing(graph: Graph, id: string): GraphEdge[] {
  return graph.edges.filter((e) => e.source === id);
}

function incoming(graph: Graph, id: string): GraphEdge[] {
  return graph.edges.filter((e) => e.target === id);
}

function degree(graph: Graph, id: string): number {
  return outgoing(graph, id).length + incoming(graph, id).length;
}

/** Detects cycles with an iterative DFS (avoids recursion depth limits). */
function countCycles(graph: Graph): number {
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) {
    adjacency.get(edge.source)?.push(edge.target);
  }

  const state = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 in-stack, 2 done
  let cycles = 0;

  for (const start of graph.nodes) {
    if (state.get(start.id)) continue;
    const stack: { id: string; index: number }[] = [{ id: start.id, index: 0 }];
    state.set(start.id, 1);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const neighbours = adjacency.get(frame.id) ?? [];

      if (frame.index < neighbours.length) {
        const next = neighbours[frame.index];
        frame.index += 1;
        const s = state.get(next) ?? 0;
        if (s === 1) {
          cycles += 1;
        } else if (s === 0) {
          state.set(next, 1);
          stack.push({ id: next, index: 0 });
        }
      } else {
        state.set(frame.id, 2);
        stack.pop();
      }
    }
  }

  return cycles;
}

/* ------------------------------------------------------------------ */
/*  The rule set                                                      */
/* ------------------------------------------------------------------ */

export function analyzeArchitecture(graph: Graph): AnalysisResult {
  const findings: ReviewFinding[] = [];
  const { nodes, edges } = graph;

  const clientNodes = byKind(graph, "client_web", "client_mobile", "client_cli");
  const datastores = byKind(graph, "database", "object_storage", "search", "cache");
  const services = byKind(graph, "service", "serverless", "worker");
  const gateways = byKind(graph, "gateway");
  const queues = byKind(graph, "queue");
  const externals = byKind(graph, "external");
  const cicd = byKind(graph, "cicd");
  const caches = byKind(graph, "cache");

  const isolated = nodes.filter((n) => degree(graph, n.id) === 0 && n.kind !== "note");
  const cycles = countCycles(graph);
  const layerCoverage = Array.from(new Set(nodes.map((n) => n.layer)));

  /* ---- empty / trivial diagram ---- */
  if (nodes.length === 0) {
    return {
      score: 0,
      summary: "The diagram is empty. Add nodes from the palette to describe your system.",
      findings: [
        finding(
          "critical",
          "Diagram is empty",
          "There are no components in this diagram, so no analysis could be performed.",
          "Drag nodes such as Client, Service and Database onto the canvas, then connect them.",
          "completeness",
        ),
      ],
      metrics: {
        nodeCount: 0,
        edgeCount: 0,
        layerCoverage: [],
        externalCount: 0,
        datastoreCount: 0,
        isolatedNodes: 0,
        cycles: 0,
      },
    };
  }

  if (nodes.length < 3) {
    findings.push(
      finding(
        "high",
        "Diagram is too small to review",
        `Only ${nodes.length} component(s) are modelled. A useful architecture view needs at least an entry point, one service and one datastore.`,
        "Add the remaining building blocks so reviewers can see the whole request path.",
        "completeness",
      ),
    );
  }

  /* ---- entry point / gateway ---- */
  if (clientNodes.length > 0 && gateways.length === 0) {
    findings.push(
      finding(
        "high",
        "No API gateway or edge layer",
        "Clients connect straight into the backend. That usually means TLS termination, authentication, rate limiting and routing are re-implemented in every service.",
        "Insert a gateway (or a managed load balancer) between clients and services, and put auth plus rate limiting there.",
        "security",
      ),
    );
  }

  for (const client of clientNodes) {
    const direct = outgoing(graph, client.id).filter((e) => {
      const target = nodes.find((n) => n.id === e.target);
      return target ? hasTag(target, "database") : false;
    });
    if (direct.length > 0) {
      findings.push(
        finding(
          "critical",
          `${client.label} talks to a datastore directly`,
          "A client component has a direct connection to a database or object store. This bypasses authorization, validation and auditing.",
          "Route all client traffic through a gateway and a backend service that owns data access.",
          "security",
        ),
      );
    }
  }

  /* ---- layer violations ---- */
  for (const edge of edges) {
    const source = nodes.find((n) => n.id === edge.source);
    const target = nodes.find((n) => n.id === edge.target);
    if (!source || !target) continue;

    if (source.layer === "presentation" && (target.layer === "data" || target.layer === "domain")) {
      findings.push(
        finding(
          "high",
          `Layer violation: ${source.label} \u2192 ${target.label}`,
          "The presentation layer is calling into the data or domain layer directly, which couples the UI to persistence and breaks the layered design.",
          "Introduce an application/service layer between the UI and persistence.",
          "layering",
        ),
      );
    }

    if (source.kind === "external" || target.kind === "external") {
      const partner = source.kind === "external" ? target : source;
      if (!partner.description?.trim() && !partner.technology?.trim()) {
        findings.push(
          finding(
            "medium",
            `External dependency undocumented: ${partner.label}`,
            "An external system is in the diagram with no recorded technology, owner or purpose. Undocumented third-party dependencies are a common source of outages.",
            "Record the vendor, purpose, data exchanged and fallback behaviour in the node inspector.",
            "documentation",
          ),
        );
      }
      if (!edge.auth?.trim() && edge.protocol?.toUpperCase() !== "HTTPS") {
        findings.push(
          finding(
            "medium",
            `Unsecured link to ${partner.label}`,
            `The connection to ${partner.label} is marked "${edge.protocol || "unknown"}" with no authentication configured.`,
            "Use TLS and document how credentials are managed for this integration.",
            "security",
          ),
        );
      }
    }
  }

  /* ---- persistence ---- */
  if (services.length > 0 && datastores.length === 0) {
    findings.push(
      finding(
        "high",
        "No datastore modelled",
        "Services are present but no database, object store or search index appears in the diagram. Where state lives is the first question any reviewer asks.",
        "Add the primary datastore and any read replicas or caches.",
        "data",
      ),
    );
  }

  /* ---- resilience ---- */
  const critical = nodes.filter((n) => n.criticality === "high");
  for (const node of critical) {
    if (!node.replication?.trim()) {
      findings.push(
        finding(
          node.kind === "database" ? "high" : "medium",
          `Single point of failure: ${node.label}`,
          `"${node.label}" is marked high criticality but no replication, failover or backup strategy is documented.`,
          "Record the replication topology (for example primary + 2 read replicas, multi-AZ) or lower its criticality.",
          "reliability",
        ),
      );
    }
  }

  const stateful = nodes.filter((n) => hasTag(n, "stateful") && n.kind === "service");
  for (const node of stateful) {
    const inboundAsync = incoming(graph, node.id).filter(
      (e) => e.direction === "async" || e.direction === "batch" || e.direction === "stream",
    );
    if (inboundAsync.length === 0) {
      findings.push(
        finding(
          "low",
          `${node.label} has no asynchronous decoupling`,
          "All inbound traffic is synchronous, so this service is on the critical path of every request.",
          "Consider moving slow or bursty work behind a queue so the request path stays responsive.",
          "scalability",
        ),
      );
    }
  }

  /* ---- async / queueing ---- */
  const syncEdges = edges.filter((e) => (e.direction ?? "sync") === "sync");
  if (syncEdges.length >= 6 && queues.length === 0) {
    findings.push(
      finding(
        "medium",
        "No message queue in a highly connected system",
        `${syncEdges.length} synchronous connections means one slow dependency can cascade into a full outage.`,
        "Add a queue (SQS, Kafka, Pub/Sub) and move at least the non-interactive work to async messaging.",
        "scalability",
      ),
    );
  }

  /* ---- caching ---- */
  if (services.length >= 3 && caches.length === 0) {
    findings.push(
      finding(
        "low",
        "No cache layer",
        "The design has several services but no cache. Repeated reads of hot data will hit the primary datastore every time.",
        "Add a cache node and document the invalidation strategy.",
        "performance",
      ),
    );
  }

  /* ---- observability ---- */
  if (
    nodes.length >= 5 &&
    !nodes.some((n) => /metric|telemetry|trace|logging/i.test(n.notes ?? ""))
  ) {
    findings.push(
      finding(
        "low",
        "No observability documented",
        "Nothing in the diagram records metrics, logs or traces for any component.",
        "Add a note describing the telemetry for each service (RED metrics, traces, alerts).",
        "operability",
      ),
    );
  }

  /* ---- delivery ---- */
  if (nodes.length >= 5 && cicd.length === 0) {
    findings.push(
      finding(
        "low",
        "No CI/CD component",
        "The deployment path is not represented, so the reviewer cannot tell how changes reach production.",
        "Add a CI/CD node and link it to the services it delivers.",
        "delivery",
      ),
    );
  }

  /* ---- documentation quality ---- */
  const undescribed = nodes.filter((n) => !n.description?.trim() && n.kind !== "note");
  if (undescribed.length > 0) {
    findings.push(
      finding(
        undescribed.length === nodes.length ? "high" : "low",
        `${undescribed.length} component(s) have no description`,
        "Components without a stated responsibility make the diagram decorative rather than useful.",
        "Add a one-line responsibility for each component in the inspector panel.",
        "documentation",
      ),
    );
  }

  const noTech = services.filter((n) => !n.technology?.trim());
  if (noTech.length > 0) {
    findings.push(
      finding(
        "low",
        `${noTech.length} service(s) have no technology recorded`,
        "The runtime, framework or managed product behind each service is unknown.",
        'Fill in the Technology field, for example "Node 22 on ECS Fargate".',
        "documentation",
      ),
    );
  }

  const undocumented = edges.filter((e) => !e.protocol?.trim());
  if (undocumented.length > 0) {
    findings.push(
      finding(
        "low",
        `${undocumented.length} connection(s) have no protocol`,
        "Protocols such as HTTPS, gRPC or AMQP are not recorded on every link.",
        "Set the protocol on each edge so the contract between components is explicit.",
        "documentation",
      ),
    );
  }

  const highCritEdges = edges.filter((e) => {
    const source = nodes.find((n) => n.id === e.source);
    const target = nodes.find((n) => n.id === e.target);
    return source?.criticality === "high" || target?.criticality === "high";
  });
  const noSla = highCritEdges.filter((e) => !e.sla?.trim());
  if (noSla.length > 0) {
    findings.push(
      finding(
        "medium",
        `${noSla.length} critical connection(s) have no SLA`,
        "Links that touch a high-criticality component have no latency or availability target.",
        'Record an SLA, for example "p99 < 200ms, 99.95% availability".',
        "reliability",
      ),
    );
  }

  /* ---- structural smells ---- */
  if (isolated.length > 0) {
    findings.push(
      finding(
        "medium",
        `${isolated.length} component(s) are not connected`,
        `Unconnected components: ${isolated.map((n) => n.label).join(", ")}. They are not part of any flow.`,
        "Connect them to their callers and dependencies, or delete them if they are not in scope.",
        "structure",
      ),
    );
  }

  if (cycles > 0) {
    findings.push(
      finding(
        cycles > 2 ? "high" : "medium",
        "Dependency cycle detected",
        `${cycles} circular dependency path(s) were found. Cycles make deployments, testing and failure analysis significantly harder.`,
        "Break the cycle with an event, a shared kernel, or by extracting the common part into a lower layer.",
        "structure",
      ),
    );
  }

  /* ---- god service / fan-out ---- */
  for (const service of services) {
    const fanOut = outgoing(graph, service.id).length;
    if (fanOut >= 8) {
      findings.push(
        finding(
          "medium",
          `High fan-out: ${service.label}`,
          `"${service.label}" depends on ${fanOut} other components, which concentrates risk and makes it hard to deploy independently.`,
          "Group cohesive dependencies behind a facade or split the service by bounded context.",
          "structure",
        ),
      );
    }
  }

  for (const node of nodes.filter(
    (n) => (hasTag(n, "edge") || hasTag(n, "frontend")) && outgoing(graph, n.id).length >= 4,
  )) {
    if (!outgoing(graph, node.id).some((e) => e.auth?.trim())) {
      findings.push(
        finding(
          "medium",
          `${node.label} has no authenticated outgoing calls`,
          "An internet-facing component makes several outbound calls with no authentication configured on any of them.",
          "Add auth requirements (OAuth2 client credentials, signed requests) to the outgoing edges.",
          "security",
        ),
      );
    }
  }

  /* ---- score ---- */
  const weights: Record<ReviewSeverity, number> = {
    critical: 22,
    high: 11,
    medium: 5,
    low: 2,
    info: 0,
  };
  const penalty = findings.reduce((sum, f) => sum + (weights[f.severity] ?? 0), 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;

  const summary =
    findings.length === 0
      ? `Strong design. ${nodes.length} components across ${layerCoverage.length} architectural layers, with no issues detected by the rule set.`
      : `Scored ${score}/100 across ${nodes.length} components and ${edges.length} connections. ` +
        (criticalCount > 0
          ? `${criticalCount} critical and ${highCount} high severity issue(s) need attention before this design is production ready.`
          : highCount > 0
            ? `${highCount} high severity issue(s) should be addressed.`
            : "No blocking issues, but several improvements are available.");

  return {
    score,
    summary,
    findings: findings.sort((a, b) => (weights[b.severity] ?? 0) - (weights[a.severity] ?? 0)),
    metrics: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      layerCoverage,
      externalCount: externals.length,
      datastoreCount: datastores.length,
      isolatedNodes: isolated.length,
      cycles,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Prompt construction for the LLM path                              */
/* ------------------------------------------------------------------ */

export function describeGraphForPrompt(graph: Graph, projectName: string): string {
  const lines: string[] = [];
  lines.push(`PROJECT: ${projectName}`);
  lines.push(`COMPONENTS (${graph.nodes.length}):`);

  for (const node of graph.nodes) {
    lines.push(
      [
        `- [${node.kind}/${node.layer}] ${node.label}`,
        node.technology ? `tech=${node.technology}` : null,
        node.responsibility ? `responsibility="${node.responsibility}"` : null,
        node.criticality ? `criticality=${node.criticality}` : null,
        node.replication ? `replication="${node.replication}"` : null,
        node.description ? `notes="${node.description}"` : null,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  lines.push(`\nCONNECTIONS (${graph.edges.length}):`);
  for (const edge of graph.edges) {
    const source = graph.nodes.find((n) => n.id === edge.source)?.label ?? edge.source;
    const target = graph.nodes.find((n) => n.id === edge.target)?.label ?? edge.target;
    lines.push(
      `- ${source} -> ${target} protocol=${edge.protocol ?? "?"} direction=${edge.direction ?? "sync"} auth=${edge.auth ?? "none"} sla=${edge.sla ?? "none"}`,
    );
  }

  return lines.join("\n");
}

export const REVIEW_SYSTEM_PROMPT = `You are a principal software architect performing a design review.

Evaluate the architecture for: scalability, reliability, security, data modelling, operability, and maintainability.

Return STRICT JSON only, with this exact shape:
{
  "score": <integer 0-100>,
  "summary": "<2-3 sentence executive summary>",
  "findings": [
    {
      "severity": "critical|high|medium|low|info",
      "title": "<short title>",
      "detail": "<why this matters, referencing specific components>",
      "suggestion": "<concrete, actionable change>",
      "category": "scalability|reliability|security|data|operability|structure|documentation|performance"
    }
  ]
}

Be specific and reference actual component names. Prefer concrete engineering advice over generic advice. Do not invent components that are not in the diagram.`;
