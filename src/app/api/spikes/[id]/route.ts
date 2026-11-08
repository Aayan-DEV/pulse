import { NextResponse } from "next/server";
import { addNote } from "@/lib/shift/spikes";

export const dynamic = "force-dynamic";

/** Employee answer. Saves the note and reruns the research with it as a hint. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { text } = (await req.json()) as { text?: string };
  if (!text?.trim()) return NextResponse.json({ error: "Write what happened" }, { status: 400 });
  const c = addNote(decodeURIComponent(id), text.trim());
  return c ? NextResponse.json({ card: c }) : NextResponse.json({ error: "No such spike" }, { status: 404 });
}
