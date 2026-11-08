// Erlang C (M/M/c) queueing formulas for counter staffing.
//
// Source for every formula in this file:
//   N. Gans, G. Koole, A. Mandelbaum (2003), "Telephone Call Centers: Tutorial,
//   Review, and Research Prospects", Manufacturing & Service Operations
//   Management 5(2):79-141, doi:10.1287/msom.5.2.79.16071.
//   PDF: https://aviman.technion.ac.il/files/References/Gans-Koole-Mandelbaum-CCReview.pdf
//   Section 3.2, eq. (1) offered load R = lambda * E[S], eq. (2) occupancy
//   rho = R / N, eq. (3) Erlang C, eq. (4) P{Wait > 0}, eq. (5) ASA, eq. (6) TSF.
//   Section 4.1.1, eq. (14) Halfin-Whitt approximation, eq. (15) square-root
//   safety staffing N = R + beta * sqrt(R).
//
// Assumptions of the model (Gans et al. 2003, section 3.2): Poisson arrivals,
// i.i.d. exponential service times, first come first served, no abandonment,
// steady state reached quickly inside each interval.

/**
 * Erlang B (loss) probability with the standard stable recursion
 * B(0) = 1, B(k) = A * B(k-1) / (k + A * B(k-1)).
 * No factorials, so no overflow for large c.
 */
export function erlangB(servers: number, load: number): number {
  if (!Number.isInteger(servers) || servers < 0) throw new Error("servers must be a non-negative integer");
  if (load < 0) throw new Error("load must be >= 0");
  let b = 1;
  for (let k = 1; k <= servers; k++) b = (load * b) / (k + load * b);
  return b;
}

/**
 * Erlang C: probability that an arriving customer has to wait, P{Wait > 0}.
 * Converted from Erlang B: C = c * B / (c - A * (1 - B)).
 * Returns 1 when c <= A (the queue is unstable and everyone waits).
 */
export function erlangC(servers: number, load: number): number {
  if (load <= 0) return 0;
  if (servers <= load) return 1;
  const b = erlangB(servers, load);
  return (servers * b) / (servers - load * (1 - b));
}

/** Offered load A = lambda * AHT in Erlangs. Gans et al. eq. (1). */
export function offeredLoad(arrivalsPerHour: number, ahtSec: number): number {
  return (arrivalsPerHour * ahtSec) / 3600;
}

/** Occupancy rho = A / c. Gans et al. eq. (2). */
export function occupancy(servers: number, load: number): number {
  return servers > 0 ? load / servers : 0;
}

/**
 * Service level: share of customers who wait at most targetSec.
 * SL = 1 - C(c, A) * exp(-(c - A) * t / AHT). Gans et al. eq. (6).
 */
export function serviceLevel(servers: number, load: number, ahtSec: number, targetSec: number): number {
  if (load <= 0) return 1;
  if (servers <= load) return 0;
  return 1 - erlangC(servers, load) * Math.exp((-(servers - load) * targetSec) / ahtSec);
}

/**
 * Average speed of answer (mean wait in queue, seconds).
 * ASA = C(c, A) * AHT / (c - A). Gans et al. eq. (5).
 */
export function asa(servers: number, load: number, ahtSec: number): number {
  if (load <= 0) return 0;
  if (servers <= load) return Infinity;
  return (erlangC(servers, load) * ahtSec) / (servers - load);
}

export type ErlangResult = {
  servers: number;
  arrivalsPerHour: number;
  ahtSec: number;
  load: number;        // A, Erlangs
  pWait: number;       // P{Wait > 0}
  serviceLevel: number;
  asaSec: number;
  occupancy: number;
};

export function erlangSummary(servers: number, arrivalsPerHour: number, ahtSec: number, targetSec: number): ErlangResult {
  const load = offeredLoad(arrivalsPerHour, ahtSec);
  return {
    servers,
    arrivalsPerHour,
    ahtSec,
    load,
    pWait: erlangC(servers, load),
    serviceLevel: serviceLevel(servers, load, ahtSec, targetSec),
    asaSec: asa(servers, load, ahtSec),
    occupancy: occupancy(servers, load),
  };
}

/**
 * Smallest number of servers c with SL >= targetSL and occupancy <= maxOccupancy.
 * Gans et al. eq. (7) style: N = min{ N : measure meets target }, valid because
 * SL is increasing in N (section 3.2).
 * Returns 0 servers when there are no arrivals (minimum crew is applied elsewhere).
 */
export function agentsForServiceLevel(
  arrivalsPerHour: number,
  ahtSec: number,
  targetSec: number,
  targetSL: number,
  maxOccupancy = 1,
): ErlangResult {
  if (arrivalsPerHour <= 0) return erlangSummary(0, 0, ahtSec, targetSec);
  if (targetSL <= 0 || targetSL >= 1) throw new Error("targetSL must be in (0, 1)");
  if (maxOccupancy <= 0 || maxOccupancy > 1) throw new Error("maxOccupancy must be in (0, 1]");
  const load = offeredLoad(arrivalsPerHour, ahtSec);
  let c = Math.max(1, Math.floor(load) + 1);
  for (; c < 10_000; c++) {
    if (serviceLevel(c, load, ahtSec, targetSec) >= targetSL && occupancy(c, load) <= maxOccupancy) break;
  }
  return erlangSummary(c, arrivalsPerHour, ahtSec, targetSec);
}

// ---------- Square-root safety staffing (Halfin and Whitt 1981) ----------

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Standard normal CDF, Abramowitz and Stegun 26.2.17 (abs error < 7.5e-8). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = 1 - normPdf(x) * poly;
  return x >= 0 ? p : 1 - p;
}

/**
 * Halfin-Whitt approximation of P{Wait > 0} for safety factor beta > 0:
 * P(beta) = [1 + beta * Phi(beta) / phi(beta)]^-1. Gans et al. eq. (14).
 */
export function halfinWhittPWait(beta: number): number {
  if (beta <= 0) return 1;
  return 1 / (1 + (beta * normCdf(beta)) / normPdf(beta));
}

/** Smallest beta with Halfin-Whitt P{Wait > 0} <= targetPWait (bisection). */
export function betaForPWait(targetPWait: number): number {
  let lo = 1e-6, hi = 6;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (halfinWhittPWait(mid) > targetPWait) lo = mid; else hi = mid;
  }
  return hi;
}

/** Square-root safety staffing N = ceil(R + beta * sqrt(R)). Gans et al. eq. (15). */
export function squareRootStaffing(load: number, beta: number): number {
  if (load <= 0) return 0;
  return Math.ceil(load + beta * Math.sqrt(load));
}
