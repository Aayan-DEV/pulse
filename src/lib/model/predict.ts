// LightGBM tree inference for the exported quantile models + conformal calibration + drivers.
import type { CityEvent, CruiseCall, ForecastHour, TransitSituation, WeatherHour } from "../types";
import conformal from "@/data/model/conformal.json";
import featureMeta from "@/data/model/features.json";
import p10Model from "@/data/model/p10.json";
import p50Model from "@/data/model/p50.json";
import p90Model from "@/data/model/p90.json";
import { buildFeatures, FEATURE_NAMES, isOpen, type TransitStats } from "./features";

type Node = { v: number } | { f: number; t: number; d: boolean; m: string; l: Node; r: Node };
type Model = { featureNames: string[]; numTrees: number; trees: Node[] };

const K_ZERO = 1e-35;

function evalTree(node: Node, x: number[]): number {
  let n = node;
  while (!("v" in n)) {
    let v = x[n.f];
    let left: boolean;
    if (n.m !== "NaN" && Number.isNaN(v)) v = 0;
    if ((n.m === "Zero" && v >= -K_ZERO && v <= K_ZERO) || (n.m === "NaN" && Number.isNaN(v))) left = n.d;
    else left = v <= n.t;
    n = left ? n.l : n.r;
  }
  return n.v;
}

/** Raw model output (sum of trees). Features must be in FEATURE_NAMES order. */
export function predictRaw(model: Model, x: number[]): number {
  let s = 0;
  for (const t of model.trees) s += evalTree(t, x);
  return s;
}

const MODELS = { p10: p10Model as Model, p50: p50Model as Model, p90: p90Model as Model };

/** Raw P10/P50/P90 then split-conformal calibration (same as model/train.py calibrate()). */
export function predictQuantiles(x: number[]): { p10: number; p50: number; p90: number; raw: { p10: number; p50: number; p90: number } } {
  const raw = { p10: predictRaw(MODELS.p10, x), p50: predictRaw(MODELS.p50, x), p90: predictRaw(MODELS.p90, x) };
  const p50 = Math.max(raw.p50, 0);
  const sc = Math.sqrt(Math.max(raw.p50, 1.0));
  const lo = raw.p10 - conformal.qLo * sc;
  const hi = raw.p90 + conformal.qHi * sc;
  return { p10: Math.max(Math.min(lo, p50), 0), p50, p90: Math.max(hi, p50), raw };
}

export const DRIVER_GROUPS = Object.keys(featureMeta.groups) as string[];
const NEUTRAL = featureMeta.neutral as Record<string, number | null>;
const GROUP_IDX: Record<string, number[]> = Object.fromEntries(
  Object.entries(featureMeta.groups as Record<string, string[]>).map(([g, cols]) => [g, cols.map((c) => (FEATURE_NAMES as readonly string[]).indexOf(c))]),
);

/**
 * Drivers by saliency (not TreeSHAP): for each group, P50(x) - P50(x with that group set to neutral values).
 * "Baseline/time" is the remainder, so the drivers sum to P50.
 */
export function drivers(x: number[]): { group: string; value: number }[] {
  const full = Math.max(predictRaw(MODELS.p50, x), 0);
  const out: { group: string; value: number }[] = [];
  let rest = full;
  for (const g of DRIVER_GROUPS) {
    if (g === "Baseline/time") continue;
    const xn = x.slice();
    for (const i of GROUP_IDX[g]) {
      const nv = NEUTRAL[FEATURE_NAMES[i]];
      xn[i] = nv === null || nv === undefined ? NaN : nv;
    }
    const v = full - Math.max(predictRaw(MODELS.p50, xn), 0);
    out.push({ group: g, value: v });
    rest -= v;
  }
  return [{ group: "Baseline/time", value: rest }, ...out];
}

/** One-call forecast for an hour. Closed hours return zeros. */
export function forecastHour(
  time: Date,
  weather: Pick<WeatherHour, "tempC" | "precipMm" | "windMs">,
  events: CityEvent[],
  situations: TransitSituation[],
  cruise: CruiseCall[],
  transitStats?: TransitStats,
): ForecastHour {
  if (!isOpen(time)) {
    return { time: time.toISOString(), p10: 0, p50: 0, p90: 0, drivers: DRIVER_GROUPS.map((g) => ({ group: g, value: 0 })) };
  }
  const x = buildFeatures(time, weather, events, situations, cruise, transitStats);
  const q = predictQuantiles(x);
  return { time: time.toISOString(), p10: q.p10, p50: q.p50, p90: q.p90, drivers: drivers(x) };
}
