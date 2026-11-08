import { getForecast } from "@/lib/forecast";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const days = Math.min(9, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? 2) || 2));
  try {
    return Response.json(await getForecast(days));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Forecast failed" }, { status: 503 });
  }
}
