/**
 * Pure attendance module (issue #13 seam one).
 * All times are injected — never read the wall clock.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ABSENCE_REASONS,
  ATTENDANCE_LOCK_HOUR_IST,
  buildExportRows,
  canWriteAttendance,
  isAttendanceLocked,
  shiftSubmissionState,
  summariseDay,
  summariseMonth,
  validateEntry,
} from "../src/lib/attendance.ts";

/** Build a Date that is that wall-clock time in Asia/Kolkata. */
function istDate(isoLocal /* YYYY-MM-DDTHH:mm:ss */) {
  // Asia/Kolkata is UTC+05:30 year-round (no DST).
  return new Date(`${isoLocal}+05:30`);
}

test("ATTENDANCE_LOCK_HOUR_IST and ABSENCE_REASONS are the single definitions", () => {
  assert.equal(ATTENDANCE_LOCK_HOUR_IST, 10);
  assert.deepEqual([...ABSENCE_REASONS], [
    "sick",
    "family",
    "village",
    "festival",
    "no_information",
    "other",
  ]);
});

test("lock is open before 10:00 IST on D+1 and closed at and after it", () => {
  const workDate = "2026-08-03";

  // Day of work — open
  assert.equal(isAttendanceLocked(workDate, istDate("2026-08-03T23:59:59")), false);

  // D+1 just before 10:00 — open
  assert.equal(isAttendanceLocked(workDate, istDate("2026-08-04T09:59:59")), false);

  // Boundary minute: 10:00:00 IST — locked (SQL >=)
  assert.equal(isAttendanceLocked(workDate, istDate("2026-08-04T10:00:00")), true);

  // One minute after — locked
  assert.equal(isAttendanceLocked(workDate, istDate("2026-08-04T10:01:00")), true);

  // Later days — locked
  assert.equal(isAttendanceLocked(workDate, istDate("2026-08-05T00:00:00")), true);
});

test("both shifts of a date lock at the same instant", () => {
  // Night shift of Aug 3 ends ~06:00 Aug 4; still same lock as day shift.
  const workDate = "2026-08-03";
  const justBefore = istDate("2026-08-04T09:59:00");
  const atLock = istDate("2026-08-04T10:00:00");

  assert.equal(isAttendanceLocked(workDate, justBefore), false);
  assert.equal(isAttendanceLocked(workDate, atLock), true);
  // No per-shift argument — one rule for the work date.
});

test("lock evaluation is correct when the machine is not in IST", () => {
  const workDate = "2026-08-03";
  // 09:59 IST = 04:29 UTC
  assert.equal(
    isAttendanceLocked(workDate, new Date("2026-08-04T04:29:00.000Z")),
    false
  );
  // 10:00 IST = 04:30 UTC
  assert.equal(
    isAttendanceLocked(workDate, new Date("2026-08-04T04:30:00.000Z")),
    true
  );
  // US Eastern wall clock that is still before IST lock
  assert.equal(
    isAttendanceLocked(workDate, new Date("2026-08-04T00:00:00.000-04:00")),
    false
  );
});

test("canWriteAttendance: admin always; supervisor own company pre-lock only", () => {
  const workDate = "2026-08-03";
  const open = istDate("2026-08-04T09:00:00");
  const locked = istDate("2026-08-04T11:00:00");

  const admin = { role: "admin", company: null };
  const supNkpl = { role: "supervisor", company: "NKPL" };
  const director = { role: "director", company: null };
  const employee = { role: "employee", company: null };

  assert.equal(
    canWriteAttendance("admin", { company: "NKPL", workDate }, admin, locked),
    true
  );
  assert.equal(
    canWriteAttendance(
      "supervisor",
      { company: "NKPL", workDate },
      supNkpl,
      open
    ),
    true
  );
  assert.equal(
    canWriteAttendance(
      "supervisor",
      { company: "APTUS", workDate },
      supNkpl,
      open
    ),
    false
  );
  assert.equal(
    canWriteAttendance(
      "supervisor",
      { company: "NKPL", workDate },
      supNkpl,
      locked
    ),
    false
  );
  assert.equal(
    canWriteAttendance(
      "director",
      { company: "NKPL", workDate },
      director,
      open
    ),
    false
  );
  assert.equal(
    canWriteAttendance(
      "employee",
      { company: "NKPL", workDate },
      employee,
      open
    ),
    false
  );
});

test("validateEntry: absent requires informed+reason; weekly_off/lent_out reject them", () => {
  assert.equal(
    validateEntry({
      kind: "absent",
      informed: true,
      reason: "sick",
      company: "NKPL",
    }).ok,
    true
  );
  assert.equal(
    validateEntry({
      kind: "absent",
      informed: null,
      reason: "sick",
      company: "NKPL",
    }).ok,
    false
  );
  assert.equal(
    validateEntry({
      kind: "absent",
      informed: true,
      reason: null,
      company: "NKPL",
    }).ok,
    false
  );

  assert.equal(
    validateEntry({ kind: "weekly_off", company: "NKPL" }).ok,
    true
  );
  assert.equal(
    validateEntry({
      kind: "weekly_off",
      informed: true,
      company: "NKPL",
    }).ok,
    false
  );
  assert.equal(
    validateEntry({
      kind: "weekly_off",
      reason: "sick",
      company: "NKPL",
    }).ok,
    false
  );

  assert.equal(
    validateEntry({
      kind: "lent_out",
      lent_to_company: "APTUS",
      company: "NKPL",
    }).ok,
    true
  );
  assert.equal(
    validateEntry({
      kind: "lent_out",
      informed: false,
      lent_to_company: "APTUS",
      company: "NKPL",
    }).ok,
    false
  );
});

test("validateEntry: other demands a note; lent_out rejects own company", () => {
  assert.equal(
    validateEntry({
      kind: "absent",
      informed: true,
      reason: "other",
      note: "flood",
      company: "NKPL",
    }).ok,
    true
  );
  assert.equal(
    validateEntry({
      kind: "absent",
      informed: true,
      reason: "other",
      note: "  ",
      company: "NKPL",
    }).ok,
    false
  );
  assert.equal(
    validateEntry({
      kind: "lent_out",
      lent_to_company: "NKPL",
      company: "NKPL",
    }).error,
    "LENT_TO_SAME_COMPANY"
  );
  assert.equal(
    validateEntry({
      kind: "lent_out",
      lent_to_company: "APTUS",
      company: "APTUS",
    }).error,
    "LENT_TO_SAME_COMPANY"
  );
});

test("confirmed-with-zero-entries vs unconfirmed-with-zero-entries differ", () => {
  assert.equal(shiftSubmissionState(null, []), "not_submitted");
  assert.equal(
    shiftSubmissionState({ confirmed_at: null, confirmed_by: null }, []),
    "not_submitted"
  );
  assert.equal(
    shiftSubmissionState(
      { confirmed_at: "2026-08-03T12:00:00Z", confirmed_by: "u1" },
      []
    ),
    "confirmed_all_present"
  );

  const daySummaryOpen = summariseDay({
    company: "NKPL",
    workDate: "2026-08-03",
    shift: "day",
    day: null,
    entries: [],
  });
  const daySummaryConfirmed = summariseDay({
    company: "NKPL",
    workDate: "2026-08-03",
    shift: "day",
    day: {
      id: "d1",
      company: "NKPL",
      work_date: "2026-08-03",
      shift: "day",
      confirmed_by: "u1",
      confirmed_at: "2026-08-03T12:00:00Z",
      created_at: "",
      updated_at: "",
    },
    entries: [],
  });

  assert.equal(daySummaryOpen.state, "not_submitted");
  assert.equal(daySummaryConfirmed.state, "confirmed_all_present");
  assert.notEqual(daySummaryOpen.state, daySummaryConfirmed.state);
});

test("summariseDay excludes weekly off from absences; splits informed; counts lent out", () => {
  const entries = [
    {
      id: "1",
      attendance_day_id: "d",
      worker_id: "w1",
      kind: "absent",
      informed: true,
      reason: "sick",
      note: null,
      lent_to_company: null,
      recorded_by: "s",
      created_at: "",
      updated_at: "",
    },
    {
      id: "2",
      attendance_day_id: "d",
      worker_id: "w2",
      kind: "absent",
      informed: false,
      reason: "no_information",
      note: null,
      lent_to_company: null,
      recorded_by: "s",
      created_at: "",
      updated_at: "",
    },
    {
      id: "3",
      attendance_day_id: "d",
      worker_id: "w3",
      kind: "weekly_off",
      informed: null,
      reason: null,
      note: null,
      lent_to_company: null,
      recorded_by: "s",
      created_at: "",
      updated_at: "",
    },
    {
      id: "4",
      attendance_day_id: "d",
      worker_id: "w4",
      kind: "lent_out",
      informed: null,
      reason: null,
      note: null,
      lent_to_company: "APTUS",
      recorded_by: "s",
      created_at: "",
      updated_at: "",
    },
  ];

  const summary = summariseDay({
    company: "NKPL",
    workDate: "2026-08-03",
    shift: "night",
    day: {
      id: "d",
      company: "NKPL",
      work_date: "2026-08-03",
      shift: "night",
      confirmed_by: "s",
      confirmed_at: "2026-08-03T20:00:00Z",
      created_at: "",
      updated_at: "",
    },
    entries,
  });

  assert.equal(summary.absenceCount, 2);
  assert.equal(summary.informedCount, 1);
  assert.equal(summary.uninformedCount, 1);
  assert.equal(summary.weeklyOffCount, 1);
  assert.equal(summary.lentOutCount, 1);
  assert.equal(summary.state, "confirmed");
});

test("summariseMonth ranks by absence count desc with stable name tie-break", () => {
  const workers = [
    { id: "a", full_name: "Asha", designation: null, company: "NKPL" },
    { id: "b", full_name: "Bimal", designation: "Operator", company: "NKPL" },
    { id: "c", full_name: "Chitra", designation: null, company: "NKPL" },
  ];
  const entries = [
    // Bimal: 2 absences
    entry("b", "absent", true),
    entry("b", "absent", false),
    // Asha and Chitra: 1 absence each — Asha before Chitra by name
    entry("a", "absent", true),
    entry("c", "absent", false),
    // Weekly offs do not affect ranking
    entry("c", "weekly_off", null),
    entry("c", "weekly_off", null),
  ];

  const ranked = summariseMonth({ entries, workers });
  assert.deepEqual(
    ranked.map((r) => r.workerName),
    ["Bimal", "Asha", "Chitra"]
  );
  assert.equal(ranked[0].absenceCount, 2);
  assert.equal(ranked[1].absenceCount, 1);
  assert.equal(ranked[2].absenceCount, 1);
  assert.equal(ranked[2].weeklyOffCount, 2);
  assert.equal(ranked[0].informedCount, 1);
  assert.equal(ranked[0].uninformedCount, 1);
});

test("buildExportRows: one row per entry with agreed columns; includes deactivated workers", () => {
  const days = [
    {
      id: "d1",
      company: "NKPL",
      work_date: "2026-08-01",
      shift: "day",
      confirmed_by: "s1",
      confirmed_at: "x",
      created_at: "",
      updated_at: "",
    },
    {
      id: "d2",
      company: "APTUS",
      work_date: "2026-08-02",
      shift: "night",
      confirmed_by: "s2",
      confirmed_at: "x",
      created_at: "",
      updated_at: "",
    },
  ];
  const workers = [
    {
      id: "w1",
      full_name: "Ramesh",
      designation: "Worker",
      company: "NKPL",
      active: false, // deactivated mid-month
    },
    {
      id: "w2",
      full_name: "Sita",
      designation: "Operator",
      company: "APTUS",
      active: true,
    },
  ];
  const entries = [
    {
      id: "e1",
      attendance_day_id: "d1",
      worker_id: "w1",
      kind: "absent",
      informed: true,
      reason: "sick",
      note: null,
      lent_to_company: null,
      recorded_by: "s1",
      created_at: "",
      updated_at: "",
    },
    {
      id: "e2",
      attendance_day_id: "d2",
      worker_id: "w2",
      kind: "lent_out",
      informed: null,
      reason: null,
      note: null,
      lent_to_company: "NKPL",
      recorded_by: "s2",
      created_at: "",
      updated_at: "",
    },
  ];

  const rows = buildExportRows({
    days,
    entries,
    workers,
    recorderNames: new Map([
      ["s1", "Tapas"],
      ["s2", "Suraj"],
    ]),
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    company: "NKPL",
    work_date: "2026-08-01",
    shift: "day",
    worker_name: "Ramesh",
    designation: "Worker",
    kind: "absent",
    informed: true,
    reason: "sick",
    note: null,
    lent_to_company: null,
    recorded_by_name: "Tapas",
  });
  assert.equal(rows[1].company, "APTUS");
  assert.equal(rows[1].worker_name, "Sita");
  assert.equal(rows[1].kind, "lent_out");
  assert.equal(rows[1].lent_to_company, "NKPL");
  assert.equal(rows[1].recorded_by_name, "Suraj");
});

function entry(workerId, kind, informed) {
  return {
    id: `${workerId}-${kind}-${Math.random()}`,
    attendance_day_id: "d",
    worker_id: workerId,
    kind,
    informed,
    reason: kind === "absent" ? "sick" : null,
    note: null,
    lent_to_company: null,
    recorded_by: "s",
    created_at: "",
    updated_at: "",
  };
}
