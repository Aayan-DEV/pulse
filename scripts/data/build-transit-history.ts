// Builds transit history from the Entur SIRI-ET BigQuery export.
// Input: a folder of yearly CSVs produced by scripts/data/sql/transit-hourly.sql
//   (columns t,stop,mode,calls,meanDelay,medDelay,p90Delay,late5Share,cancelled).
// Output:
//   src/data/transit-history.json          rail and metro at Nationaltheatret, hourly
//   model/data/transit-history.csv          every mode, hourly (bus and tram too)
//   src/data/transit-episodes.json          merged disruption episodes (consecutive bad hours)
// Usage: npx tsx scripts/data/build-transit-history.ts <csvDir>
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: build-transit-history.ts <csvDir>");
const root = path.resolve(__dirname, "..", "..");

type Row = {
  t: string; stop: "NT" | "OSL"; mode: string; calls: number;
  meanDelay: number | null; medDelay: number | null; p90Delay: number | null;
  late5Share: number | null; cancelled: number;
};

const num = (s: string) => (s === "" ? null : Number(s));
const rows: Row[] = [];
const cutoff = new Date(); // drop today and future hours (still estimated)
cutoff.setHours(0, 0, 0, 0);
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".csv")).sort()) {
  const lines = fs.readFileSync(path.join(dir, f), "utf8").trim().split("\n");
  for (const line of lines.slice(1)) {
    const [t, stop, mode, calls, meanDelay, medDelay, p90Delay, late5Share, cancelled] = line.split(",");
    if (!t || new Date(t) >= cutoff) continue;
    rows.push({
      t, stop: stop as Row["stop"], mode, calls: Number(calls),
      meanDelay: num(meanDelay), medDelay: num(medDelay), p90Delay: num(p90Delay),
      late5Share: num(late5Share), cancelled: Number(cancelled),
    });
  }
}
rows.sort((a, b) => a.t.localeCompare(b.t) || a.stop.localeCompare(b.stop) || a.mode.localeCompare(b.mode));

// Full CSV for the model (all modes).
fs.mkdirSync(path.join(root, "model", "data"), { recursive: true });
const csv = ["t,stop,mode,calls,meanDelay,medDelay,p90Delay,late5Share,cancelled"]
  .concat(rows.map((r) => [r.t, r.stop, r.mode, r.calls, r.meanDelay ?? "", r.medDelay ?? "", r.p90Delay ?? "", r.late5Share ?? "", r.cancelled].join(",")));
fs.writeFileSync(path.join(root, "model", "data", "transit-history.csv"), csv.join("\n") + "\n");

// Compact JSON for the app: rail and metro at Nationaltheatret (Oslo S rail, bus and tram stay in the CSV to keep the file under 8 MB).
const compact = rows
  .filter((r) => r.stop === "NT" && (r.mode === "rail" || r.mode === "metro"))
  .map((r) => ({ t: r.t, stop: r.stop, mode: r.mode, calls: r.calls, meanDelay: r.meanDelay, p90Delay: r.p90Delay, late5Share: r.late5Share, cancelled: r.cancelled }));
fs.writeFileSync(
  path.join(root, "src", "data", "transit-history.json"),
  "[\n" + compact.map((r) => JSON.stringify(r)).join(",\n") + "\n]\n",
);

// Disruption hours: rail or metro hours with >= 4 planned calls where either
// more than 20% of calls were cancelled or the median delay exceeded 10 minutes.
const bad = (r: Row) =>
  (r.mode === "rail" || r.mode === "metro") && r.calls >= 4 &&
  (r.cancelled / r.calls > 0.2 || (r.medDelay ?? 0) > 10);

type Episode = {
  stop: string; mode: string; start: string; end: string; hours: number;
  calls: number; cancelled: number; maxMedianDelay: number; meanCancelShare: number; score: number;
};
const episodes: Episode[] = [];
const byKey = new Map<string, Row[]>();
for (const r of rows) {
  const k = `${r.stop}|${r.mode}`;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k)!.push(r);
}
const HOUR = 3600_000;
for (const [k, list] of byKey) {
  const [stop, mode] = k.split("|");
  let cur: Row[] = [];
  const flush = () => {
    if (!cur.length) return;
    const calls = cur.reduce((s, r) => s + r.calls, 0);
    const cancelled = cur.reduce((s, r) => s + r.cancelled, 0);
    const lateCalls = cur.reduce((s, r) => s + (r.late5Share ?? 0) * (r.calls - r.cancelled), 0);
    const endT = new Date(new Date(cur[cur.length - 1].t).getTime() + HOUR);
    episodes.push({
      stop, mode, start: cur[0].t, end: toOslo(endT), hours: cur.length, calls, cancelled,
      maxMedianDelay: Math.max(...cur.map((r) => r.medDelay ?? 0)),
      meanCancelShare: Math.round((cancelled / calls) * 1000) / 1000,
      score: Math.round(cancelled + lateCalls),
    });
    cur = [];
  };
  for (const r of list) {
    if (!bad(r)) continue;
    const prev = cur[cur.length - 1];
    // allow a one-hour gap inside an episode
    if (prev && new Date(r.t).getTime() - new Date(prev.t).getTime() > 2 * HOUR) flush();
    cur.push(r);
  }
  flush();
}
episodes.sort((a, b) => b.score - a.score);
fs.writeFileSync(path.join(root, "src", "data", "transit-episodes.json"), JSON.stringify(episodes, null, 1));

function toOslo(d: Date): string {
  // Format a Date as local Oslo time with offset, e.g. 2024-03-01T10:00:00+01:00
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "longOffset",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  const off = g("timeZoneName").replace("GMT", "") || "+00:00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}${off}`;
}

console.log(JSON.stringify({
  allRows: rows.length, jsonRows: compact.length, first: rows[0]?.t, last: rows[rows.length - 1]?.t,
  episodes: episodes.length, top: episodes.slice(0, 30),
}, null, 1));
