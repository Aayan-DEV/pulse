import { NextResponse } from "next/server";
import { getLiveSnapshot } from "@/lib/live";

export const dynamic = "force-dynamic";

// GET /api/live -> LiveSnapshot. Each source is cached in memory for 60-600 s inside src/lib/live.
export async function GET() {
  const snapshot = await getLiveSnapshot();
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
