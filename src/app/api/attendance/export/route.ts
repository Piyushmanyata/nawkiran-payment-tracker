import ExcelJS from "exceljs";
import { buildExportRows } from "@/lib/attendance";
import { createClient } from "@/utils/supabase/server";
import type {
  AttendanceDay,
  AttendanceEntry,
  AbsenceReason,
  Company,
  Shift,
  Worker,
} from "@/types/database";

export const runtime = "nodejs";

const STAFF_ROLES = new Set(["employee", "accounts", "director", "admin"]);
const ENTRY_PAGE_SIZE = 1000;

function nextMonthStart(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const month = (url.searchParams.get("month") ?? "").trim();
  const monthNumber = Number(month.slice(5));
  if (
    !/^\d{4}-\d{2}$/.test(month) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    return Response.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.active) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!STAFF_ROLES.has(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const from = `${month}-01`;
  const to = nextMonthStart(month);

  const { data: dayRows, error: dayErr } = await supabase
    .from("attendance_days")
    .select(
      "id, company, work_date, shift, confirmed_by, confirmed_at, created_at, updated_at"
    )
    .gte("work_date", from)
    .lt("work_date", to);

  if (dayErr) {
    return Response.json({ error: "Failed to load days" }, { status: 500 });
  }

  const days = (dayRows ?? []) as AttendanceDay[];
  const dayIds = days.map((d) => d.id);

  const entries: AttendanceEntry[] = [];
  if (dayIds.length > 0) {
    for (let offset = 0; ; offset += ENTRY_PAGE_SIZE) {
      const { data: entryRows, error: entryErr } = await supabase
        .from("attendance_entries")
        .select(
          "id, attendance_day_id, worker_id, informed, reason, note, recorded_by, created_at, updated_at"
        )
        .in("attendance_day_id", dayIds)
        .order("id", { ascending: true })
        .range(offset, offset + ENTRY_PAGE_SIZE - 1);
      if (entryErr) {
        return Response.json({ error: "Failed to load entries" }, { status: 500 });
      }
      entries.push(
        ...(entryRows ?? []).map((r) => ({
          id: String(r.id),
          attendance_day_id: String(r.attendance_day_id),
          worker_id: String(r.worker_id),
          informed: Boolean(r.informed),
          reason: r.reason as AbsenceReason,
          note: (r.note as string | null) ?? null,
          recorded_by: String(r.recorded_by),
          created_at: String(r.created_at ?? ""),
          updated_at: String(r.updated_at ?? ""),
        }))
      );
      if ((entryRows ?? []).length < ENTRY_PAGE_SIZE) break;
    }
  }

  const { data: workerRows, error: workerErr } = await supabase
    .from("workers")
    .select(
      "id, company, full_name, designation, active, created_by, created_at, updated_at"
    );
  if (workerErr) {
    return Response.json({ error: "Failed to load workers" }, { status: 500 });
  }
  const workers = (workerRows ?? []) as Worker[];

  const recorderIds = [...new Set(entries.map((e) => e.recorded_by))];
  const recorderNames = new Map<string, string>();
  if (recorderIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", recorderIds);
    for (const p of profiles ?? []) {
      recorderNames.set(String(p.id), String(p.full_name ?? ""));
    }
  }

  const rows = buildExportRows({
    days: days.map((d) => ({
      ...d,
      company: d.company as Company,
      shift: d.shift as Shift,
    })),
    entries,
    workers: workers.map((w) => ({
      ...w,
      company: w.company as Company,
    })),
    recorderNames,
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nawkiran";
  const sheet = workbook.addWorksheet("Attendance");
  sheet.columns = [
    { header: "Company", key: "company", width: 10 },
    { header: "Date", key: "work_date", width: 12 },
    { header: "Shift", key: "shift", width: 8 },
    { header: "Worker", key: "worker_name", width: 28 },
    { header: "Job", key: "designation", width: 18 },
    { header: "Told us", key: "informed", width: 10 },
    { header: "Reason", key: "reason", width: 16 },
    { header: "Note", key: "note", width: 28 },
    { header: "Recorded by", key: "recorded_by_name", width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const r of rows) {
    sheet.addRow({
      company: r.company,
      work_date: r.work_date,
      shift: r.shift,
      worker_name: r.worker_name,
      designation: r.designation ?? "",
      informed: r.informed ? "yes" : "no",
      reason: r.reason ?? "",
      note: r.note ?? "",
      recorded_by_name: r.recorded_by_name ?? "",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `attendance-${month}.xlsx`;

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
