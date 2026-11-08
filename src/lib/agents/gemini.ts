// Vertex AI Gemini on the global endpoint. Auth: gcloud Application Default Credentials (no key file).
// Server only. The access token comes from `gcloud auth application-default print-access-token` and is cached 45 min.
import "server-only";
import { execFile } from "node:child_process";

type Tok = { token: string; at: number };
const g = globalThis as unknown as { __pulseGcpTok?: Tok };

async function accessToken(): Promise<string> {
  if (g.__pulseGcpTok && Date.now() - g.__pulseGcpTok.at < 45 * 60_000) return g.__pulseGcpTok.token;
  const token = await new Promise<string>((res, rej) =>
    execFile("gcloud", ["auth", "application-default", "print-access-token"], { timeout: 15_000 }, (err, out) =>
      err ? rej(new Error("No Google Cloud credentials (run gcloud auth application-default login)")) : res(out.trim())));
  g.__pulseGcpTok = { token, at: Date.now() };
  return token;
}

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
export type GenOpts = { parts: Part[]; system?: string; search?: boolean; schema?: object; timeoutMs?: number };
export type GenResult = { text: string; sources: { title?: string; uri: string }[]; model: string; ms: number };

export function geminiConfig() {
  return { project: process.env.GCP_PROJECT_ID, location: process.env.GCP_LOCATION || "global", model: process.env.GEMINI_MODEL };
}

/** One generateContent call. Exactly one HTTP request per call; aborts after timeoutMs. */
export async function generate(o: GenOpts): Promise<GenResult> {
  const { project, location, model } = geminiConfig();
  if (!project || !model) throw new Error("GCP_PROJECT_ID or GEMINI_MODEL is not set in .env.local");
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: o.parts }],
    generationConfig: { temperature: 0.2, ...(o.schema ? { responseMimeType: "application/json", responseSchema: o.schema } : {}) },
  };
  if (o.system) body.systemInstruction = { parts: [{ text: o.system }] };
  if (o.search) body.tools = [{ googleSearch: {} }];
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 90_000);
  try {
    const r = await fetch(url, {
      method: "POST", signal: ctl.signal,
      headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = (await r.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri: string; title?: string } }[] } }[];
    };
    const c = j.candidates?.[0];
    const text = (c?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    const sources = (c?.groundingMetadata?.groundingChunks ?? []).flatMap((x) => (x.web ? [{ uri: x.web.uri, title: x.web.title }] : []));
    return { text, sources, model: model!, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

/** Parse JSON from a model answer that may wrap it in ``` fences. */
export function parseJson<T>(text: string): T {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (m ? m[1] : text).trim();
  const start = raw.search(/[[{]/);
  return JSON.parse(start > 0 ? raw.slice(start) : raw) as T;
}
