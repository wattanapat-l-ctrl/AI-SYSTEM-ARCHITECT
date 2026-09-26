import type { ServiceSelection, ServiceCatalogItem } from "./types";
import { UNIT_FACTORS } from "./constants";

export interface CostLine {
  selectionId: string;
  serviceId: string;
  key: string;
  name: string;
  vendor: string;
  category: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  monthly: number;
  annual: number;
  notes: string;
}

export interface CostBreakdown {
  lines: CostLine[];
  monthlyTotal: number;
  annualTotal: number;
  byCategory: { category: string; monthly: number; share: number }[];
  topDrivers: CostLine[];
  assumptions: string[];
}

const HOURS_PER_MONTH = 730;

/**
 * Converts a catalog unit into a monthly cost.
 * Returns null when the unit cannot be normalised automatically.
 */
export function monthlyForUnit(unit: string, unitPrice: number, quantity: number): number {
  const factor = UNIT_FACTORS[unit];
  if (!factor) return unitPrice * quantity;
  if (factor.hours) return unitPrice * quantity * factor.hours;
  return unitPrice * quantity;
}

export function computeCostBreakdown(
  selections: ServiceSelection[],
  catalogById: Map<string, ServiceCatalogItem>,
): CostBreakdown {
  const lines: CostLine[] = [];
  const assumptionSet = new Set<string>();

  for (const sel of selections) {
    const service = sel.service ?? catalogById.get(sel.service_id);
    if (!service) continue;

    const unitPrice = Number(service.unit_price_usd) || 0;
    const quantity = Number(sel.quantity) || 0;

    if (UNIT_FACTORS[service.unit]?.hours) {
      assumptionSet.add(`${service.name}: billed hourly, priced at ${HOURS_PER_MONTH}h/month.`);
    }
    if (unitPrice === 0) {
      assumptionSet.add(`${service.name}: free tier assumed, real usage may add cost.`);
    }

    const monthly = monthlyForUnit(service.unit, unitPrice, quantity);

    lines.push({
      selectionId: sel.id,
      serviceId: service.id,
      key: service.key,
      name: service.name,
      vendor: service.vendor,
      category: service.category,
      unit: service.unit,
      unitPrice,
      quantity,
      monthly,
      annual: monthly * 12,
      notes: sel.notes ?? "",
    });
  }

  lines.sort((a, b) => b.monthly - a.monthly);

  const monthlyTotal = lines.reduce((sum, l) => sum + l.monthly, 0);

  const catMap = new Map<string, number>();
  for (const line of lines) {
    catMap.set(line.category, (catMap.get(line.category) ?? 0) + line.monthly);
  }

  const byCategory = Array.from(catMap.entries())
    .map(([category, monthly]) => ({
      category,
      monthly,
      share: monthlyTotal > 0 ? (monthly / monthlyTotal) * 100 : 0,
    }))
    .sort((a, b) => b.monthly - a.monthly);

  return {
    lines,
    monthlyTotal,
    annualTotal: monthlyTotal * 12,
    byCategory,
    topDrivers: lines.filter((l) => l.monthly > 0).slice(0, 5),
    assumptions: Array.from(assumptionSet),
  };
}

/** Rough cost/benefit commentary used on the cost page. */
export function costInsights(breakdown: CostBreakdown): string[] {
  const out: string[] = [];

  if (breakdown.lines.length === 0) {
    return ["No services selected yet. Add services to estimate your monthly run rate."];
  }

  const top = breakdown.topDrivers[0];
  if (top && breakdown.monthlyTotal > 0) {
    const share = (top.monthly / breakdown.monthlyTotal) * 100;
    if (share > 50) {
      out.push(
        `${top.name} accounts for ${share.toFixed(0)}% of spend. Optimising or right-sizing it has the biggest impact.`,
      );
    }
  }

  const free = breakdown.lines.filter((l) => l.unitPrice === 0);
  if (free.length > 0) {
    out.push(
      `${free.length} service(s) are on a free tier. Confirm the usage limits before relying on them in production.`,
    );
  }

  const compute = breakdown.byCategory.find((c) => c.category === "compute" || c.category === "serverless");
  if (compute && breakdown.monthlyTotal > 0) {
    out.push(
      `Compute is ${compute.share.toFixed(0)}% of spend. Serverless or autoscaling usually beats fixed instances for spiky traffic.`,
    );
  }

  const db = breakdown.byCategory.find((c) => c.category === "database");
  if (db && db.monthly > 0) {
    out.push("Database cost dominates as data grows. Plan for storage and read-replica tiers early.");
  }

  if (breakdown.monthlyTotal > 0) {
    out.push(
      `Estimated run rate: $${breakdown.monthlyTotal.toFixed(2)}/month, $${breakdown.annualTotal.toFixed(2)}/year. Excludes taxes, support plans and egress overages.`,
    );
  }

  return out;
}
