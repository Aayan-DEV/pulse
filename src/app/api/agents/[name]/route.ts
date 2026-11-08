import { NextResponse } from "next/server";
import { AGENTS, loadRuns, type AgentName } from "@/lib/agents/store";
import { isRunning, runAgent } from "@/lib/agents/run";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const valid = (n: string): n is AgentName => (AGENTS as string[]).includes(n);

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!valid(name)) return NextResponse.json({ error: "unknown agent" }, { status: 404 });
  return NextResponse.json({ running: isRunning(name), runs: loadRuns(name).slice(0, 5) });
}

export async function POST(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!valid(name)) return NextResponse.json({ error: "unknown agent" }, { status: 404 });
  const r = await runAgent(name);
  return NextResponse.json(r, { status: "busy" in r ? 409 : 200 });
}
