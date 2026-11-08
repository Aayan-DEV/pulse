// Events logged by employees. Stored in agent-runs/events-employee.json and used by the forecast, What if and Events.
import "server-only";
import type { CityEvent } from "@/lib/types";
import { readExtra, writeExtra } from "@/lib/agents/store";

export type EmployeeEvent = CityEvent & { reportedBy: "employee-reported"; reportedAt: string };
export const employeeEvents = (): EmployeeEvent[] => readExtra<EmployeeEvent[]>("events-employee", []);
export function addEmployeeEvent(e: Omit<EmployeeEvent, "id" | "reportedBy" | "reportedAt" | "sources">) {
  const ev: EmployeeEvent = { ...e, id: `employee-${Date.now()}`, reportedBy: "employee-reported", reportedAt: new Date().toISOString(),
    attendanceIsEstimate: true, sources: [{ label: "Employee report (unverified)", url: "/" }] };
  writeExtra("events-employee", [ev, ...employeeEvents()].slice(0, 200));
  return ev;
}
