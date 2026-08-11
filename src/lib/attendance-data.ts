/**
 * Browser data access for attendance — selects under RLS + write RPCs.
 * No realtime channel (ADR / CONTEXT: payments-live and todos-live only).
 */

import { nextMonthStart } from "@/lib/attendance";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type {
  AbsenceReason,
  AttendanceDay,
  AttendanceEntry,
  AttendanceEvent,
  AttendanceEventAction,
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
    informed: Boolean(row.informed),
    reason: row.reason as AbsenceReason,
    note: (row.note as string | null) ?? null,
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

function asEvent(row: Record<string, unknown>): AttendanceEvent {
  const profile = row.profiles as Record<string, unknown> | null | undefined;
  return {
    id: Number(row.id ?? 0),
    attendance_day_id: String(row.attendance_day_id ?? ""),
    entry_id: (row.entry_id as string | null) ?? null,
    action: row.action as AttendanceEventAction,
    performed_by: String(row.performed_by ?? ""),
    created_at: String(row.created_at ?? ""),
    actor_name: profile
      ? String(profile.full_name ?? "")
      : ((row.actor_name as string | null) ?? null),
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

/** All workers including inactive — Workers tab / export. */
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
  const entries: AttendanceEntry[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("attendance_entries")
      .select(
        "id, attendance_day_id, worker_id, informed, reason, note, recorded_by, created_at, updated_at, workers(full_name, designation)"
      )
      .in("attendance_day_id", dayIds)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    entries.push(...(data ?? []).map((r) => asEntry(r as Record<string, unknown>)));
    if ((data ?? []).length < pageSize) break;
  }
  return entries;
}

export async function fetchAttendanceEvents(
  dayIds: string[]
): Promise<AttendanceEvent[]> {
  if (dayIds.length === 0) return [];
  const supabase = getSupabaseBrowserClient();
  // Actor name via FK embed — one round trip (issue #16 perf).
  const { data, error } = await supabase
    .from("attendance_events")
    .select(
      "id, attendance_day_id, entry_id, action, performed_by, created_at, profiles!attendance_events_performed_by_fkey(full_name)"
    )
    .in("attendance_day_id", dayIds)
    .order("created_at", { ascending: false });
  if (error) {
    // Fallback if embed name differs — still one attempt then profiles batch.
    const { data: plain, error: plainError } = await supabase
      .from("attendance_events")
      .select("id, attendance_day_id, entry_id, action, performed_by, created_at")
      .in("attendance_day_id", dayIds)
      .order("created_at", { ascending: false });
    if (plainError) throw plainError;
    const events = (plain ?? []).map((r) => asEvent(r as Record<string, unknown>));
    const actorIds = [...new Set(events.map((event) => event.performed_by))];
    if (actorIds.length === 0) return events;
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);
    if (profileError) throw profileError;
    const names = new Map(
      (profiles ?? []).map((profile) => [
        String(profile.id),
        String(profile.full_name ?? ""),
      ])
    );
    return events.map((event) => ({
      ...event,
      actor_name: names.get(event.performed_by) ?? null,
    }));
  }
  return (data ?? []).map((r) => asEvent(r as Record<string, unknown>));
}

export async function upsertAttendanceEntry(input: {
  workDate: string;
  shift: Shift;
  workerId: string;
  informed: boolean;
  reason: AbsenceReason;
  note?: string | null;
  company?: Company | null;
}): Promise<AttendanceEntry> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("upsert_attendance_entry", {
    p_work_date: input.workDate,
    p_shift: input.shift,
    p_worker_id: input.workerId,
    p_informed: input.informed,
    p_reason: input.reason,
    p_note: input.note ?? null,
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
