"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutGrid, Map, TrendingUp, Search, Users, CalendarDays, TrainFront,
  Gauge, BookOpen, Database, Sun, Moon, Radar, Bot, FlaskConical, Clock3,
} from "lucide-react";

type Item = { href: string; label: string; icon: React.ElementType };
type View = "employee" | "employer";

// The crew sees today and the live signals. The employer also gets planning, agents and the model pages.
const NAV: Record<View, { group: string; items: Item[] }[]> = {
  employee: [
    { group: "Today", items: [
      { href: "/", label: "Shift", icon: Clock3 },
      { href: "/transit", label: "Trains and trams", icon: TrainFront },
      { href: "/events", label: "Events", icon: CalendarDays },
      { href: "/map", label: "Live map", icon: Map },
    ]},
  ],
  employer: [
    { group: "Today", items: [
      { href: "/overview", label: "Overview", icon: LayoutGrid },
      { href: "/transit", label: "Trains and trams", icon: TrainFront },
      { href: "/events", label: "Events", icon: CalendarDays },
      { href: "/map", label: "Live map", icon: Map },
    ]},
    { group: "Plan", items: [
      { href: "/forecast", label: "Forecast", icon: TrendingUp },
      { href: "/staffing", label: "Staffing", icon: Users },
      { href: "/what-if", label: "What if", icon: FlaskConical },
      { href: "/why", label: "Why it spiked", icon: Search },
    ]},
    { group: "Behind the scenes", items: [
      { href: "/agents", label: "Agents", icon: Bot },
      { href: "/sources", label: "Data sources", icon: Database },
      { href: "/benchmark", label: "Benchmark", icon: Gauge },
      { href: "/method", label: "Method", icon: BookOpen },
    ]},
  ],
};
const HOME: Record<View, string> = { employee: "/", employer: "/overview" };

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

function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="ak-seg view-switch" role="group" aria-label="Who is using this">
      {(["employee", "employer"] as const).map((v) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => onChange(v)}>{v === "employee" ? "Employee" : "Employer"}</button>
      ))}
    </div>
  );
}

export default function Shell({ children, initialView }: { children: React.ReactNode; initialView: View }) {
  const path = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [view, setView] = useState<View>(initialView);
  const nav = NAV[view];
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const switchView = (v: View) => {
    if (v === view) return;
    document.cookie = `pulse-view=${v}; path=/; max-age=31536000; samesite=lax`;
    setView(v);
    // Stay on the page if the other view has it too, otherwise go to that view's start page.
    if (NAV[v].some((g) => g.items.some((it) => isActive(it.href)))) router.refresh();
    else router.push(HOME[v]);
  };
  return (
    <div className="adm">
      <aside className="adm-sidebar">
        <div className="ak-brand">
          <Radar className="ak-brand-logo" />
          <div className="ak-brand-name">Pulse <span>Oslo</span></div>
        </div>
        <div className="view-switch-wrap"><ViewSwitch view={view} onChange={switchView} /></div>
        <nav className="adm-nav-scroll">
          {nav.map((g) => (
            <div key={g.group}>
              <div className="adm-nav-group">{g.group}</div>
              {g.items.map((it) => {
                const active = isActive(it.href);
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
          <span className="ak-stamp adm-header-right">Burger King Klingenberg · Nationaltheatret</span>
          <button className="ak-icon-btn adm-mobile-only" onClick={toggle} type="button" aria-label="Switch theme">{theme === "dark" ? <Sun /> : <Moon />}</button>
        </header>
        <div className="adm-mobile-only view-switch-mobile"><ViewSwitch view={view} onChange={switchView} /></div>
        <nav className="adm-mobile-nav" aria-label="Sections">
          {nav.flatMap((g) => g.items).map((it) => (
            <Link key={it.href} href={it.href} aria-current={isActive(it.href) ? "page" : undefined}>{it.label}</Link>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}

