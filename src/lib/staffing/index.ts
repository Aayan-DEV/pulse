// Workforce engine: forecast -> staff per hour -> legal weekly roster.
// Method and sources: docs/staffing-method.md

export {
  erlangB, erlangC, serviceLevel, asa, occupancy, offeredLoad, agentsForServiceLevel,
  erlangSummary, halfinWhittPWait, betaForPWait, squareRootStaffing, normCdf,
  type ErlangResult,
} from "./erlang";
export {
  staffRequirements, DEFAULT_STAFFING,
  type StaffingParams, type StaffRequirementDetail, type Quantile, type FrontMethod, type OpeningHours, type Phase,
} from "./requirements";
export {
  buildSchedule, solveDay, candidateShifts,
  type ScheduleResult, type AssignedShift, type CoverageHour, type DaySolve, type Role,
} from "./schedule";
export {
  DEFAULT_RULES, syntheticRoster, paidHours, nightHours,
  type Rules, type GroupRules, type Employee, type AgeGroup, type Shift,
} from "./rules";
export { checkRoster, checkEmployee, touchesSunday, type Violation } from "./check";
export { toLocalHour, clock } from "./time";
export { syntheticWeekForecast } from "./demo";
