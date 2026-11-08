import fs from "node:fs";
import path from "node:path";

// Reads src/data/<rel> fresh on each call (files are small); missing file returns the fallback.
export function readDataFile<T>(rel: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "src", "data", rel), "utf8")) as T;
  } catch {
    return fallback;
  }
}
