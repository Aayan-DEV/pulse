// Live inventory: start-of-day stock minus today's (simulated) sales x per-order ratios.
// ASSUMPTIONS: the ratios and the opening stock are illustrative, not BK data; no mid-day deliveries.
import type { SalesHour } from "./sales";

export const ITEMS = [
  { key: "patties", label: "Beef patties", unit: "pcs", perOrder: 1.15, start: 1300 },
  { key: "fries", label: "Fries", unit: "portions", perOrder: 0.85, start: 1000 },
  { key: "buns", label: "Buns", unit: "pcs", perOrder: 1.1, start: 1250 },
  { key: "drinks", label: "Drinks", unit: "cups", perOrder: 0.9, start: 1000 },
];
export type Stock = { key: string; label: string; unit: string; start: number; left: number; share: number; hoursLeft: number | null; level: "green" | "yellow" | "red" };

export function inventory(hours: SalesHour[]): { items: Stock[]; ordersToday: number; pacePerHour: number } {
  const ordersToday = hours.reduce((s, h) => s + (h.actual ?? h.soFar ?? 0), 0);
  const cur = hours.find((h) => h.current);
  const pacePerHour = cur?.projected ?? hours.filter((h) => h.done && h.open).slice(-1)[0]?.actual ?? 0;
  const items = ITEMS.map((it) => {
    const left = Math.max(0, Math.round(it.start - ordersToday * it.perOrder));
    const rate = pacePerHour * it.perOrder;
    const hoursLeft = rate > 0 ? left / rate : null;
    const level: Stock["level"] = left / it.start < 0.15 || (hoursLeft != null && hoursLeft < 2) ? "red" : left / it.start < 0.35 || (hoursLeft != null && hoursLeft < 4) ? "yellow" : "green";
    return { key: it.key, label: it.label, unit: it.unit, start: it.start, left, share: left / it.start, hoursLeft, level };
  });
  return { items, ordersToday, pacePerHour };
}
