// Camera watcher: Gemini vision on the road-camera stills, one call for all cameras, structured JSON.
// These are Statens vegvesen ROAD cameras 1.6 to 9.8 km away, not the store's street.
import "server-only";
import { readData } from "@/lib/data";
import type { Camera } from "@/lib/types";
import { generate, parseJson } from "./gemini";

export type CameraReading = { id: string; name?: string; distanceM?: number; trafficLevel: string; roadSurface: string; precipitation: string; visibility: string; incidents: string[]; note: string };

const SCHEMA = {
  type: "OBJECT",
  properties: {
    cameras: { type: "ARRAY", items: { type: "OBJECT", properties: {
      id: { type: "STRING" },
      trafficLevel: { type: "STRING", enum: ["none", "light", "moderate", "heavy", "standstill", "unknown"] },
      roadSurface: { type: "STRING", enum: ["dry", "wet", "snow", "ice", "unknown"] },
      precipitation: { type: "STRING", enum: ["none", "rain", "snow", "unknown"] },
      visibility: { type: "STRING", enum: ["good", "reduced", "poor", "dark"] },
      incidents: { type: "ARRAY", items: { type: "STRING" } },
      note: { type: "STRING" },
    }, required: ["id", "trafficLevel", "roadSurface", "precipitation", "visibility", "incidents", "note"] } },
    summary: { type: "STRING" },
  },
  required: ["cameras", "summary"],
};

export async function runCameraWatcher() {
  const cams = readData<Camera[]>("cameras.json", []);
  const imgs = await Promise.all(cams.map(async (c) => {
    try {
      const r = await fetch(c.imageUrl!, { signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return null;
      return { c, data: Buffer.from(await r.arrayBuffer()).toString("base64") };
    } catch { return null; }
  }));
  const ok = imgs.filter((x): x is NonNullable<typeof x> => !!x);
  if (!ok.length) throw new Error("No camera image could be fetched");
  const parts = [
    { text: `You read ${ok.length} road camera stills from Oslo, Norway, taken just now. For each image, in order, report traffic level, road surface, precipitation, visibility and any incidents (crash, stopped vehicle, roadworks, emergency vehicles). Be literal; if you cannot tell, say unknown. Camera ids in order: ${ok.map((x) => x.c.id).join(", ")}.` },
    ...ok.map((x) => ({ inlineData: { mimeType: "image/jpeg", data: x.data } })),
  ];
  const r = await generate({ parts, schema: SCHEMA, timeoutMs: 90_000 });
  const j = parseJson<{ cameras: CameraReading[]; summary: string }>(r.text);
  const readings = j.cameras.map((x, i) => {
    const c = cams.find((k) => k.id === x.id) ?? ok[i]?.c;
    return { ...x, id: c?.id ?? x.id, name: c?.name, distanceM: c?.distanceM };
  });
  return { result: { readings, summary: j.summary, imagesRead: ok.length, camerasListed: cams.length }, model: r.model };
}
