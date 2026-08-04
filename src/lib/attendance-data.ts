/**
 * Browser data access for attendance — selects under RLS + write RPCs.
 * No realtime channel (ADR / CONTEXT: payments-live and todos-live only).
 */

import { getSupabaseBrowserClient } from "@/lib/supabase";
import type {
  AbsenceReason,
  AttendanceDay,
  AttendanceEntry,
  AttendanceKind,
  Company,
  Shift,
  Worker,
} from "@/types/database";

function asWorker(row: Record<string, unknown>): Worker {
  return {
    id: String(row.id ?? ""),
    company: row.company as Company,
    full_name: String(row.full_name ?? ""),
    designation: (row.designation as string | null) ?? null,
    active: Boolean(row.active),
    created_by: String(row.created_by ?? ""),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function asDay(row: Record<string, unknown>): AttendanceDay {
  return {
    id: String(row.id ?? ""),
    company: row.company as Company,
    work_date: String(row.work_date ?? ""),
    shift: row.shift as Shift,
    confirmed_by: (row.confirmed_by as string | null) ?? null,
    confirmed_at: (row.confirmed_at as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function asEntry(row: Record<string, unknown>): AttendanceEntry {
  const worker = row.workers as Record<string, unknown> | null | undefined;
  return {
    id: String(row.id ?? ""),
    attendance_day_id: String(row.attendance_day_id ?? ""),
    worker_id: String(row.worker_id ?? ""),
    kind: row.kind as AttendanceKind,
    informed: (row.informed as boolean | null) ?? null,
    reason: (row.reason as AbsenceReason | null) ?? null,
    note: (row.note as string | null) ?? null,
    lent_to_company: (row.lent_to_company as Company | null) ?? null,
    recorded_by: String(row.recorded_by ?? ""),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    worker_name: worker
      ? String(worker.full_name ?? "")
      : ((row.worker_name as string | null) ?? null),
    worker_designation: worker
      ? ((worker.designation as string | null) ?? null)
      : ((row.worker_designation as string | null) ?? null),
  };
}

/** Active roster for one company (RLS scopes supervisors). */
export async function fetchWorkers(company?: Company): Promise<Worker[]> {
  const supabase = getSupabaseBrowserClient();
  let q = supabase
    .from("workers")
    .select("id, company, full_name, designation, active, created_by, created_at, updated_at")
    .eq("active", true)
    .order("full_name");
  if (company) q = q.eq("company", company);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => asWorker(r as Record<string, unknown>));
}

/** All workers including inactive — month summary / export. */
export async function fetchWorkersAll(company?: Company): Promise<Worker[]> {
  const supabase = getSupabaseBrowserClient();
  let q = supabase
    .from("workers")
    .select("id, company, full_name, designation, active, created_by, created_at, updated_at")
    .order("full_name");
  if (company) q = q.eq("company", company);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => asWorker(r as Record<string, unknown>));
}

export async function fetchAttendanceDays(opts: {
  workDate?: string;
  monthPrefix?: string; // YYYY-MM
  company?: Company;
}): Promise<AttendanceDay[]> {
  const supabase = getSupabaseBrowserClient();
  let q = supabase
    .from("attendance_days")
    .select(
      "id, company, work_date, shift, confirmed_by, confirmed_at, created_at, updated_at"
    )
    .order("work_date", { ascending: false });
  if (opts.workDate) q = q.eq("work_date", opts.workDate);
  if (opts.monthPrefix) {
    q = q
      .gte("work_date", `${opts.monthPrefix}-01`)
      .lt("work_date", nextMonthStart(opts.monthPrefix));
  }
  if (opts.company) q = q.eq("company", opts.company);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => asDay(r as Record<string, unknown>));
}

export async function fetchAttendanceEntries(
  dayIds: string[]
): Promise<AttendanceEntry[]> {
  if (dayIds.length === 0) return [];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("attendance_entries")
    .select(
      "id, attendance_day_id, worker_id, kind, informed, reason, note, lent_to_company, recorded_by, created_at, updated_at, workers(full_name, designation)"
    )
    .in("attendance_day_id", dayIds);
  if (error) throw error;
  return (data ?? []).map((r) => asEntry(r as Record<string, unknown>));
}

function nextMonthStart(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

export async function upsertAttendanceEntry(input: {
  workDate: string;
  shift: Shift;
  workerId: string;
  kind: AttendanceKind;
  informed?: boolean | null;
  reason?: AbsenceReason | null;
  note?: string | null;
  lentToCompany?: Company | null;
  company?: Company | null;
}): Promise<AttendanceEntry> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("upsert_attendance_entry", {
    p_work_date: input.workDate,
    p_shift: input.shift,
    p_worker_id: input.workerId,
    p_kind: input.kind,
    p_informed: input.informed ?? null,
    p_reason: input.reason ?? null,
    p_note: input.note ?? null,
    p_lent_to_company: input.lentToCompany ?? null,
    p_company: input.company ?? null,
  });
  if (error) throw error;
  return asEntry((data ?? {}) as Record<string, unknown>);
}

export async function deleteAttendanceEntry(entryId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("delete_attendance_entry", {
    p_entry_id: entryId,
  });
  if (error) throw error;
}

export async function confirmAttendanceShift(input: {
  workDate: string;
  shift: Shift;
  company?: Company | null;
}): Promise<AttendanceDay> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("confirm_attendance_shift", {
    p_work_date: input.workDate,
    p_shift: input.shift,
    p_company: input.company ?? null,
  });
  if (error) throw error;
  return asDay((data ?? {}) as Record<string, unknown>);
}

export async function reopenAttendanceShift(input: {
  workDate: string;
  shift: Shift;
  company?: Company | null;
}): Promise<AttendanceDay> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("reopen_attendance_shift", {
    p_work_date: input.workDate,
    p_shift: input.shift,
    p_company: input.company ?? null,
  });
  if (error) throw error;
  return asDay((data ?? {}) as Record<string, unknown>);
}

export async function addWorker(input: {
  fullName: string;
  designation?: string | null;
  company?: Company | null;
}): Promise<Worker> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("add_worker", {
    p_full_name: input.fullName,
    p_designation: input.designation ?? null,
    p_company: input.company ?? null,
  });
  if (error) throw error;
  return asWorker((data ?? {}) as Record<string, unknown>);
}

/** Admin-only worker rename / designation / deactivate. */
export async function updateWorkerViaRpc(input: {
  workerId: string;
  fullName?: string | null;
  designation?: string | null;
  active?: boolean | null;
}): Promise<Worker> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("update_worker", {
    p_worker_id: input.workerId,
    p_full_name: input.fullName ?? null,
    p_designation: input.designation ?? null,
    p_active: input.active ?? null,
  });
  if (error) throw error;
  return asWorker((data ?? {}) as Record<string, unknown>);
}

export const REASON_LABELS: Record<AbsenceReason, string> = {
  sick: "Sick",
  family: "Family/personal",
  village: "Village/home",
  festival: "Marriage/festival",
  no_information: "No information",
  other: "Other",
};

export const KIND_LABELS: Record<AttendanceKind, string> = {
  absent: "Absent",
  weekly_off: "Weekly off",
  lent_out: "Lent out",
};
