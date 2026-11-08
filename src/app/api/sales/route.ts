import { NextResponse } from "next/server";
import { forceRush } from "@/lib/shift/sales";

export const dynamic = "force-dynamic";

/** Demo only: make the current hour of the SIMULATED sales stream a rush (x2.1). */
export async function POST() {
  const h = new Date(Math.floor(Date.now() / 3600_000) * 3600_000).toISOString();
  forceRush(h);
  return NextResponse.json({ forced: h });
}
