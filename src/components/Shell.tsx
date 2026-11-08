"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutGrid, Map, TrendingUp, Search, Users, CalendarDays, TrainFront,
  Gauge, BookOpen, Database, Sun, Moon, Radar,
} from "lucide-react";

const NAV: { group: string; items: { href: string; label: string; icon: React.ElementType }[] }[] = [
  { group: "Store", items: [
    { href: "/", label: "Overview", icon: LayoutGrid },
    { href: "/map", label: "Live map", icon: Map },
    { href: "/forecast", label: "Forecast", icon: TrendingUp },
    { href: "/why", label: "Why it spiked", icon: Search },
  ]},
  { group: "People", items: [
    { href: "/staffing", label: "Staffing", icon: Users },
  ]},
  { group: "Signals", items: [
    { href: "/events", label: "Events", icon: CalendarDays },
    { href: "/transit", label: "Trains and trams", icon: TrainFront },
    { href: "/sources", label: "Data sources", icon: Database },
  ]},
  { group: "Model", items: [
    { href: "/benchmark", label: "Benchmark", icon: Gauge },
    { href: "/method", label: "Method", icon: BookOpen },
  ]},
];

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    let t: string | null = null;
    try { t = localStorage.getItem("pulse-theme"); } catch {}
    const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const v = (t === "light" || t === "dark") ? t : sys;
    setTheme(v);
    document.documentElement.dataset.theme = v;
  }, []);
  const toggle = () => {
    const v = theme === "dark" ? "light" : "dark";
    setTheme(v);
    document.documentElement.dataset.theme = v;
    try { localStorage.setItem("pulse-theme", v); } catch {}
    window.dispatchEvent(new CustomEvent("pulse-theme", { detail: v }));
  };
  return { theme, toggle };
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { theme, toggle } = useTheme();
  return (
    <div className="adm">
      <aside className="adm-sidebar">
        <div className="ak-brand">
          <Radar className="ak-brand-logo" />
          <div className="ak-brand-name">Pulse <span>Oslo</span></div>
        </div>
        <nav className="adm-nav-scroll">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="adm-nav-group">{g.group}</div>
              {g.items.map((it) => {
                const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
                const Icon = it.icon;
                return (
                  <Link key={it.href} href={it.href} className={`adm-nav${active ? " active" : ""}`}>
                    <Icon /> {it.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="adm-sidebar-footer">
          <button className="adm-nav" onClick={toggle} type="button">
            {theme === "dark" ? <Sun /> : <Moon />} {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <div className="ak-whoami">
            <div className="ak-whoami-av">BK</div>
            <div>
              <div className="ak-whoami-name">Klingenberggata 5</div>
              <div className="ak-whoami-sub">0161 Oslo</div>
            </div>
          </div>
        </div>
      </aside>
      <div className="adm-main">
        <header className="adm-header">
          <span className="ak-live-dot" aria-hidden />
          <span className="ak-stamp">Live: weather, trains and trams, events, cameras</span>
          <span style={{ flex: 1 }} />
          <span className="ak-stamp">Burger King Klingenberg · Nationaltheatret</span>
        </header>
        {children}
      </div>
    </div>
  );
}

