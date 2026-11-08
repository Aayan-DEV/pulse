// Runs one agent with a cost guard: one model call per run, a timeout inside each agent, and no stacking
// (a second request while the agent runs gets the "already running" answer instead of a new call).
import "server-only";
import { runEventScout } from "./eventScout";
import { runCameraWatcher } from "./cameraWatcher";
import { runStaffingOverseer } from "./staffingOverseer";
import { saveRun, type AgentName, type AgentRun } from "./store";

const RUNNERS: Record<AgentName, () => Promise<{ result: unknown; model: string }>> = {
  "event-scout": runEventScout, "camera-watcher": runCameraWatcher, "staffing-overseer": runStaffingOverseer,
};
const g = globalThis as unknown as { __pulseAgentLocks?: Set<AgentName> };
const locks = (g.__pulseAgentLocks ??= new Set());

export async function runAgent(name: AgentName): Promise<AgentRun | { busy: true }> {
  if (locks.has(name)) return { busy: true };
  locks.add(name);
  const t0 = Date.now();
  try {
    const { result, model } = await RUNNERS[name]();
    const run: AgentRun = { agent: name, at: new Date().toISOString(), ok: true, ms: Date.now() - t0, model, result };
    saveRun(run); return run;
  } catch (e) {
    const run: AgentRun = { agent: name, at: new Date().toISOString(), ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
    saveRun(run); return run;
  } finally {
    locks.delete(name);
  }
}
export const isRunning = (n: AgentName) => locks.has(n);
