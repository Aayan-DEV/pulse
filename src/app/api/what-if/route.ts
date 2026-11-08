import { NextResponse } from "next/server";
import { runWhatIf, type Scenario } from "@/lib/whatif";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const sc = (await req.json()) as Scenario;
    return NextResponse.json(await runWhatIf(sc));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
