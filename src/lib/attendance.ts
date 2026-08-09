/**
 * Pure attendance rules (ADR-0005, ADR-0006, ADR-0010, ADR-0011, ADR-0012).
 * Components call this module and render — they never re-implement a rule.
 * Server truth for writes is the RPCs; this mirrors lock + validation + summaries.
 */

import type {
  AbsenceReason,
  AttendanceDay,
  AttendanceEntry,
  Company,
  Profile,
  Shift,
  UserRole,
  Worker,
} from "@/types/database";

/** Cutoff hour on D+1 in Asia/Kolkata — single definition (ADR-0006). */
export const ATTENDANCE_LOCK_HOUR_IST = 10;

/** Reason chips for Absent entries — single definition. */
export const ABSENCE_REASONS: readonly AbsenceReason[] = [
  "sick",
  "family",
  "village",
  "festival",
  "no_information",
  "other",
] as const;

export type ShiftSubmissionState =
  | "not_submitted"
  | "confirmed_all_present"
  | "confirmed";

export type ValidateEntryInput = {
  informed?: boolean | null;
  reason?: AbsenceReason | string | null;
  note?: string | null;
  /**
   * Removed kinds (weekly_off, lent_out) must fail closed if a caller still
   * sends them. Presence is never recorded.
   */
  kind?: string | null;
};

export type ValidateEntryResult =
  | { ok: true }
  | { ok: false; error: string };

export type DayShiftSummary = {
  company: Company;
  workDate: string;
  shift: Shift;
  state: ShiftSubmissionState;
  absenceCount: number;
  informedCount: number;
  uninformedCount: number;
  entries: AttendanceEntry[];
};

export type MonthWorkerSummary = {
  workerId: string;
  workerName: string;
  designation: string | null;
  company: Company;
  absenceCount: number;
  informedCount: number;
  uninformedCount: number;
};

export type ExportRow = {
  company: Company;
  work_date: string;
  shift: Shift;
  worker_name: string;
  designation: string | null;
  informed: boolean;
  reason: AbsenceReason;
  note: string | null;
  recorded_by_name: string | null;
};

/** Card control booleans — pure module decides, UI only renders (issue #16). */
export type AttendanceDayActions = {
  showAdd: boolean;
  showEdit: boolean;
  showRemove: boolean;
  /**
   * "No, everyone came" — the only surviving confirmation tap (ADR-0012).
   * Recording an absence confirms the Shift by itself, so this shows only on a
   * Shift that has none: the one case that leaves no evidence behind.
   */
  showEveryoneCame: boolean;
  /** Undo for a mistaken "everyone came". Admin only (ADR-0012). */
  showOpenAgain: boolean;
  isLocked: boolean;
  isDone: boolean;
};

function partsInIst(now: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const bags = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value])
  ) as Record<string, string>;
  return {
    year: Number(bags.year),
    month: Number(bags.month),
    day: Number(bags.day),
    hour: Number(bags.hour),
    minute: Number(bags.minute),
    second: Number(bags.second),
  };
}

/** Parse YYYY-MM-DD as a plain calendar date (no timezone). */
function parseWorkDate(workDate: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(workDate.trim());
  if (!m) throw new Error(`INVALID_DATE: ${workDate}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** Add one calendar day to a Y-M-D triple. */
function nextCalendarDay(y: number, m: number, d: number) {
  // Use UTC noon to avoid DST/edge issues when stepping the calendar.
  const dt = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));
  return {
    y: dt.getUTCFullYear(),
    m: dt.getUTCMonth() + 1,
    d: dt.getUTCDate(),
  };
}

/**
 * Client mirror of `public.attendance_locked`.
 * An Attendance Day for D locks at 10:00 IST on D+1.
 * Pass `now` in tests — never read the wall clock from callers under test.
 */
export function isAttendanceLocked(
  workDate: string,
  now: Date = new Date()
): boolean {
  const work = parseWorkDate(workDate);
  const lockDay = nextCalendarDay(work.y, work.m, work.d);
  const ist = partsInIst(now);

  if (ist.year !== lockDay.y) return ist.year > lockDay.y;
  if (ist.month !== lockDay.m) return ist.month > lockDay.m;
  if (ist.day !== lockDay.d) return ist.day > lockDay.d;
  if (ist.hour !== ATTENDANCE_LOCK_HOUR_IST) {
    return ist.hour > ATTENDANCE_LOCK_HOUR_IST;
  }
  // At the lock hour: locked from minute 0 second 0 inclusive (matches SQL >=).
  return true;
}

/**
 * Who may write attendance for a given company + work date.
 * Admin: always (including post-lock).
 * Supervisor: own company only, and only before the lock.
 * Everyone else: never.
 */
export function canWriteAttendance(
  role: UserRole | null | undefined,
  target: { company: Company; workDate: string },
  profile: Pick<Profile, "role" | "company"> | null | undefined,
  now: Date = new Date()
): boolean {
  if (!role || !profile) return false;
  if (role === "admin") return true;
  if (role !== "supervisor") return false;
  if (profile.company == null || profile.company !== target.company) return false;
  return !isAttendanceLocked(target.workDate, now);
}

/**
 * Which controls a company-and-shift card should show.
 * Mirrors getPaymentActions: pure booleans in, booleans out.
 *
 * `entryCount` is load-bearing (ADR-0012): the everyone-came answer exists only
 * for a Shift with no absences, because an absence confirms the Shift by itself.
 * Confirming no longer freezes the Shift — it stays editable until the Lock.
 */
export function getAttendanceDayActions(
  role: UserRole | null | undefined,
  profile: Pick<Profile, "role" | "company"> | null | undefined,
  target: { company: Company; workDate: string },
  day: Pick<AttendanceDay, "confirmed_at" | "confirmed_by"> | null | undefined,
  entryCount: number,
  now: Date = new Date()
): AttendanceDayActions {
  const isLocked = isAttendanceLocked(target.workDate, now);
  const isDone = Boolean(day?.confirmed_at || day?.confirmed_by);
  const none: AttendanceDayActions = {
    showAdd: false,
    showEdit: false,
    showRemove: false,
    showEveryoneCame: false,
    showOpenAgain: false,
    isLocked,
    isDone,
  };

  if (!role || !profile) return none;

  const showEveryoneCame = !isDone && entryCount === 0;

  if (role === "admin") {
    return {
      showAdd: true,
      showEdit: true,
      showRemove: true,
      showEveryoneCame,
      showOpenAgain: isDone,
      isLocked,
      isDone,
    };
  }

  if (role !== "supervisor") return none;
  if (profile.company == null || profile.company !== target.company) {
    return none;
  }
  if (isLocked) return none;

  return {
    showAdd: true,
    showEdit: true,
    showRemove: true,
    showEveryoneCame,
    showOpenAgain: false,
    isLocked,
    isDone,
  };
}

/**
 * Reason to select once "Did he tell us?" is answered.
 * **No** always forces `no_information`, overwriting a reason already picked —
 * no answer means we did not learn why, so the Reason follows the answer.
 * To record "sick, and he did not tell us", answer No first, then pick Sick.
 * **Yes** forces nothing and leaves any chosen Reason alone.
 */
export function reasonForInformedAnswer(
  informed: boolean,
  current: AbsenceReason | null | undefined
): AbsenceReason | null {
  if (!informed) return "no_information";
  return current ?? null;
}

/** Mirrors attendance_entries check constraints for pre-submit UI validation. */
export function validateEntry(input: ValidateEntryInput): ValidateEntryResult {
  // Fail closed on removed kinds (weekly_off, lent_out) if a caller still sends them.
  if (input.kind != null && String(input.kind).trim() !== "" && input.kind !== "absent") {
    return { ok: false, error: "INVALID_KIND" };
  }

  if (input.informed == null) {
    return { ok: false, error: "INVALID_INFORMED" };
  }
  const reason = (input.reason ?? null) as AbsenceReason | null;
  if (!reason || !ABSENCE_REASONS.includes(reason)) {
    return { ok: false, error: "INVALID_REASON" };
  }
  const note = input.note == null ? null : String(input.note).trim();
  if (reason === "other" && (!note || note.length < 1)) {
    return { ok: false, error: "INVALID_NOTE" };
  }
  if (note && note.length > 200) {
    return { ok: false, error: "INVALID_NOTE" };
  }
  return { ok: true };
}

/**
 * How a shift should render for the Director summary.
 * Zero entries + confirmed = all present.
 * Zero entries + not confirmed = not submitted.
 * Never the same.
 */
export function shiftSubmissionState(
  day: Pick<AttendanceDay, "confirmed_at" | "confirmed_by"> | null | undefined,
  entries: readonly AttendanceEntry[]
): ShiftSubmissionState {
  const confirmed = Boolean(day?.confirmed_at || day?.confirmed_by);
  if (!confirmed) return "not_submitted";
  if (entries.length === 0) return "confirmed_all_present";
  return "confirmed";
}

function countAbsences(entries: readonly AttendanceEntry[]) {
  let absenceCount = 0;
  let informedCount = 0;
  let uninformedCount = 0;
  for (const e of entries) {
    absenceCount += 1;
    if (e.informed === true) informedCount += 1;
    else uninformedCount += 1;
  }
  return { absenceCount, informedCount, uninformedCount };
}

export function summariseDay(input: {
  company: Company;
  workDate: string;
  shift: Shift;
  day: AttendanceDay | null | undefined;
  entries: readonly AttendanceEntry[];
}): DayShiftSummary {
  const counts = countAbsences(input.entries);
  return {
    company: input.company,
    workDate: input.workDate,
    shift: input.shift,
    state: shiftSubmissionState(input.day, input.entries),
    ...counts,
    entries: [...input.entries],
  };
}

/**
 * Month ranking from absences only: count descending, stable name tie-break.
 * Workers with zero absences produce no row.
 */
export function summariseMonth(input: {
  days: readonly Pick<AttendanceDay, "id" | "company">[];
  entries: readonly AttendanceEntry[];
}): MonthWorkerSummary[] {
  const dayById = new Map(input.days.map((day) => [day.id, day.company]));
  const byId = new Map<string, MonthWorkerSummary>();

  for (const e of input.entries) {
    let row = byId.get(e.worker_id);
    if (!row) {
      row = {
        workerId: e.worker_id,
        workerName: e.worker_name?.trim() || "Unknown",
        designation: e.worker_designation ?? null,
        company: dayById.get(e.attendance_day_id) ?? "NKPL",
        absenceCount: 0,
        informedCount: 0,
        uninformedCount: 0,
      };
      byId.set(e.worker_id, row);
    }
    row.absenceCount += 1;
    if (e.informed === true) row.informedCount += 1;
    else row.uninformedCount += 1;
  }

  return [...byId.values()].sort((a, b) => {
    if (b.absenceCount !== a.absenceCount) {
      return b.absenceCount - a.absenceCount;
    }
    return a.workerName.localeCompare(b.workerName, "en", {
      sensitivity: "base",
    });
  });
}

/**
 * Pure export row shaping — one row per Entry. No file generation here.
 * Includes deactivated Workers when they appear on entries (via joined names).
 */
export function buildExportRows(input: {
  days: readonly AttendanceDay[];
  entries: readonly AttendanceEntry[];
  workers: readonly Pick<
    Worker,
    "id" | "full_name" | "designation" | "company" | "active"
  >[];
  recorderNames?: ReadonlyMap<string, string>;
}): ExportRow[] {
  const dayById = new Map(input.days.map((d) => [d.id, d]));
  const workerById = new Map(input.workers.map((w) => [w.id, w]));
  const rows: ExportRow[] = [];

  for (const e of input.entries) {
    const day = dayById.get(e.attendance_day_id);
    if (!day) continue;
    const worker = workerById.get(e.worker_id);
    rows.push({
      company: day.company,
      work_date: day.work_date,
      shift: day.shift,
      worker_name: worker?.full_name ?? (e.worker_name?.trim() || "Unknown"),
      designation: worker?.designation ?? e.worker_designation ?? null,
      informed: e.informed,
      reason: e.reason,
      note: e.note,
      recorded_by_name:
        input.recorderNames?.get(e.recorded_by) ?? e.recorder_name ?? null,
    });
  }

  rows.sort((a, b) => {
    if (a.work_date !== b.work_date) return a.work_date < b.work_date ? -1 : 1;
    if (a.company !== b.company) return a.company.localeCompare(b.company);
    if (a.shift !== b.shift) return a.shift.localeCompare(b.shift);
    return a.worker_name.localeCompare(b.worker_name, "en", {
      sensitivity: "base",
    });
  });

  return rows;
}
