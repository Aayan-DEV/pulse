// Writes src/data/cameras.json (fallback for the live route): nearest Statens vegvesen cameras,
// keeping only those whose still image URL answers 200 with an image/* content type right now.
import fs from "node:fs";
import path from "node:path";
import { getCameras } from "../../src/lib/live/cameras";

(async () => {
  const cams = await getCameras();
  const ok = [];
  for (const c of cams) {
    const res = await fetch(c.imageUrl, { method: "GET" });
    const type = res.headers.get("content-type") ?? "";
    console.log(c.id, c.distanceM, res.status, type);
    if (res.ok && type.startsWith("image/")) ok.push(c);
  }
  fs.writeFileSync(path.resolve(__dirname, "..", "..", "src", "data", "cameras.json"), JSON.stringify(ok, null, 1));
  console.log("wrote", ok.length);
})();
