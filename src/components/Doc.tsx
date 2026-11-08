import { marked } from "marked";
import { readDoc } from "@/lib/data";

// Renders a markdown file from docs/. Docs are written by us, not by users,
// so the HTML is trusted; links open in a new tab.
export default function Doc({ file, missing }: { file: string; missing: string }) {
  const md = readDoc(file);
  if (!md) return <div className="ak-empty">{missing}</div>;
  const html = (marked.parse(md, { async: false }) as string).replace(/<a href=/g, '<a target="_blank" rel="noreferrer" href=');
  return <div className="ak-prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
