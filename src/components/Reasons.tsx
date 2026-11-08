// Reasons as simple bars: "Christmas market +45 orders". Server-safe.
export default function Reasons({ reasons, empty = "Nothing unusual: a normal day." }: {
  reasons: { group: string; label: string; value: number }[]; empty?: string;
}) {
  if (!reasons.length) return <div className="ak-empty">{empty}</div>;
  const max = Math.max(1, ...reasons.map((r) => Math.abs(r.value)));
  return (
    <>
      {reasons.map((r) => (
        <div key={r.group} className="ak-row" style={{ gridTemplateColumns: "minmax(0,1fr) 120px 92px" }}>
          <div className="ak-row-title">{r.label}</div>
          <div className="ak-bar-track"><div className={`ak-bar-fill${r.value < 0 ? " neg" : ""}`} style={{ width: `${(100 * Math.abs(r.value)) / max}%` }} /></div>
          <div className={`ak-row-n${r.value < 0 ? " is-bad" : ""}`}>{r.value > 0 ? "+" : "−"}{Math.abs(r.value)} orders</div>
        </div>
      ))}
    </>
  );
}
