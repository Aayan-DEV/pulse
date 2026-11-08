import { NextResponse } from "next/server";
import { forceRush, setDemoOffset, demoOffset } from "@/lib/shift/sales";
import { isOpen } from "@/lib/model/features";

export const dynamic = "force-dynamic";

/** Demo only: make the current hour of the SIMULATED sales stream a rush (x2.1).
 *  Body {"at": "13:20"} first moves the demo clock to that Oslo time today (for when the store is closed); {"reset": true} clears it. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { at?: string; reset?: boolean };
  if (b.reset) { setDemoOffset(0); return NextResponse.json({ demoClock: null }); }
  // Store closed right now: move the demo clock to 13:20 today so the rush lands in an open hour (the screen says so).
  if (!b.at && !isOpen(new Date(Date.now() + demoOffset()))) b.at = "13:20";
  if (b.at && /^\d{1,2}:\d{2}$/.test(b.at)) {
    const [H, M] = b.at.split(":").map(Number);
    const local = new Date().toLocaleString("en-US", { timeZone: "Europe/Oslo" });
    const nowLocal = new Date(local);
    setDemoOffset(((H - nowLocal.getHours()) * 60 + (M - nowLocal.getMinutes())) * 60_000);
  }
  const now = Date.now() + demoOffset();
  const h = new Date(Math.floor(now / 3600_000) * 3600_000).toISOString();
  forceRush(h);
  return NextResponse.json({ forced: h, demoOffsetMin: Math.round(demoOffset() / 60_000) });
}
