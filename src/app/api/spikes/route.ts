import { NextResponse } from "next/server";
import { liveSales } from "@/lib/shift/sales";
import { detectSpikes, openManual } from "@/lib/shift/spikes";

export const dynamic = "force-dynamic";

export async function GET() {
  const { hours, now } = await liveSales();
  return NextResponse.json({ cards: detectSpikes(hours, now) });
}

/** "Explain this spike": opens a card for the current hour (or the latest open hour) even below P90. */
export async function POST() {
  const { hours } = await liveSales();
  const h = hours.find((x) => x.current && x.open) ?? hours.filter((x) => x.done && x.open).slice(-1)[0];
  if (!h) return NextResponse.json({ error: "The store is closed now" }, { status: 400 });
  return NextResponse.json({ card: openManual(h) });
}
