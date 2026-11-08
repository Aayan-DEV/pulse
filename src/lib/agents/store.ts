// Agent results on disk (agent-runs/, git-ignored), newest first, last 20 per agent.
import "server-only";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type AgentName = "event-scout" | "camera-watcher" | "staffing-overseer";
export const AGENTS: AgentName[] = ["event-scout", "camera-watcher", "staffing-overseer"];
export type AgentRun<T = unknown> = { agent: AgentName; at: string; ok: boolean; ms: number; model?: string; error?: string; result?: T };

const DIR = join(process.cwd(), "agent-runs");
const file = (n: string) => join(DIR, `${n}.json`);

export function loadRuns<T = unknown>(name: AgentName): AgentRun<T>[] {
  try { return JSON.parse(readFileSync(file(name), "utf8")) as AgentRun<T>[]; } catch { return []; }
}
export function saveRun(run: AgentRun) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(file(run.agent), JSON.stringify([run, ...loadRuns(run.agent)].slice(0, 20), null, 1));
}
export function readExtra<T>(name: string, fallback: T): T {
  try { return JSON.parse(readFileSync(file(name), "utf8")) as T; } catch { return fallback; }
}
export function writeExtra(name: string, v: unknown) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(file(name), JSON.stringify(v, null, 1));
}
