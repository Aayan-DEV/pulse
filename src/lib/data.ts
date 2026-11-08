import "server-only";
import fs from "node:fs";
import path from "node:path";

// Reads a JSON file from src/data at request time. A missing or broken file
// returns the fallback, so a page never crashes while data is being rebuilt.
export function readData<T>(rel: string, fallback: T): T {
  try {
    const p = path.join(process.cwd(), "src", "data", rel);
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function readDoc(rel: string): string | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "docs", rel), "utf8");
  } catch {
    return null;
  }
}
