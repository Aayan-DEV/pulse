"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, LoaderCircle } from "lucide-react";

export default function AgentRunButton({ name, running }: { name: string; running: boolean }) {
  const [busy, setBusy] = useState(running);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {msg && <span className="faint" style={{ fontSize: 12 }}>{msg}</span>}
      <button className="ak-btn" disabled={busy} onClick={async () => {
        setBusy(true); setMsg(null);
        try {
          const r = await fetch(`/api/agents/${name}`, { method: "POST" });
          if (r.status === 409) setMsg("Already running");
          else { const j = await r.json(); setMsg(j.ok ? `Done in ${(j.ms / 1000).toFixed(0)} s` : "Failed, see below"); }
        } catch { setMsg("Network error"); }
        setBusy(false); router.refresh();
      }}>
        {busy ? <LoaderCircle className="spin" style={{ width: 14, height: 14 }} /> : <Play style={{ width: 14, height: 14 }} />}
        {busy ? "Running" : "Run now"}
      </button>
    </div>
  );
}
