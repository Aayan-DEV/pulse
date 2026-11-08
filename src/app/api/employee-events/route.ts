import { NextResponse } from "next/server";
import { addEmployeeEvent, employeeEvents } from "@/lib/shift/employeeEvents";
import type { EventCategory } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() { return NextResponse.json(employeeEvents()); }

export async function POST(req: Request) {
  const b = (await req.json()) as { title?: string; venue?: string; lat?: number; lon?: number; people?: number; startsInH?: number; lastsH?: number; category?: EventCategory };
  if (!b.title?.trim() || typeof b.lat !== "number" || typeof b.lon !== "number") return NextResponse.json({ error: "Say what and where" }, { status: 400 });
  const start = new Date(Math.floor(Date.now() / 900_000) * 900_000 + (b.startsInH ?? 0) * 3600_000);
  const end = new Date(start.getTime() + Math.max(0.5, b.lastsH ?? 2) * 3600_000);
  const ev = addEmployeeEvent({ title: b.title.trim().slice(0, 120), category: b.category ?? "other", venue: b.venue, lat: b.lat, lon: b.lon,
    start: start.toISOString(), end: end.toISOString(), expectedAttendance: Math.max(1, Math.round(b.people ?? 50)) });
  return NextResponse.json({ event: ev });
}
