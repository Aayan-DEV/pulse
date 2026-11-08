// Recharts props that read the Eto tokens, so charts follow light and dark mode.
export const axis = {
  tick: { fill: "var(--od-faint)", fontSize: 11, fontFamily: "var(--od-body)" },
  tickLine: false,
  axisLine: { stroke: "var(--od-line)" },
} as const;

export const grid = { stroke: "var(--od-line)", strokeDasharray: "0", vertical: false } as const;

export const tip = {
  contentStyle: {
    background: "var(--od-bg)", border: "1px solid var(--od-line)", borderRadius: 4,
    boxShadow: "var(--od-shadow)", fontSize: 12, fontFamily: "var(--od-body)", color: "var(--od-ink)",
  },
  labelStyle: { color: "var(--od-muted)", marginBottom: 4 },
  itemStyle: { padding: 0 },
  cursor: { stroke: "var(--od-ring)" },
} as const;
