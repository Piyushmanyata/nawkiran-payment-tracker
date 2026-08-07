/**
 * Pure attendance module (issues #13, #16 — seam one).
 * All times are injected — never read the wall clock.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ABSENCE_REASONS,
  ATTENDANCE_LOCK_HOUR_IST,
  buildExportRows,
  canWriteAttendance,
  getAttendanceDayActions,
  isAttendanceLocked,
  reasonForInformedAnswer,
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

test("validateEntry: absence requires informed+reason; other needs a note", () => {
  assert.equal(
    validateEntry({
      informed: true,
      reason: "sick",
    }).ok,
    true
  );
  assert.equal(
    validateEntry({
      informed: null,
      reason: "sick",
    }).ok,
    false
  );
  assert.equal(
    validateEntry({
      informed: true,
      reason: null,
    }).ok,
    false
  );
  assert.equal(
    validateEntry({
      informed: true,
      reason: "unknown",
    }).error,
    "INVALID_REASON"
  );
  assert.equal(
    validateEntry({
      informed: true,
      reason: "other",
      note: "flood",
    }).ok,
    true
  );
  assert.equal(
    validateEntry({
      informed: true,
      reason: "other",
      note: "  ",
    }).ok,
    false
  );
  assert.equal(
    validateEntry({
      informed: true,
      reason: "sick",
      note: "x".repeat(201),
    }).error,
    "INVALID_NOTE"
  );
});

test("validateEntry: removed kinds are rejected as INVALID_KIND", () => {
  // Load-bearing: weekly_off (ADR-0009) and lent_out (ADR-0010) must not quietly pass.
  assert.equal(
    validateEntry({
      kind: "weekly_off",
      informed: true,
      reason: "sick",
    }).error,
    "INVALID_KIND"
  );
  assert.equal(
    validateEntry({
      kind: "lent_out",
      informed: true,
      reason: "sick",
    }).error,
    "INVALID_KIND"
  );
});

test("reasonForInformedAnswer: 'no' always forces no_information", () => {
  // Answering "he did not tell us" sets the reason, empty or not.
  assert.equal(reasonForInformedAnswer(false, null), "no_information");
  assert.equal(reasonForInformedAnswer(false, undefined), "no_information");
  assert.equal(reasonForInformedAnswer(false, "sick"), "no_information");
  assert.equal(reasonForInformedAnswer(false, "other"), "no_information");

  // "Yes" forces nothing: it neither picks a reason nor clears one.
  assert.equal(reasonForInformedAnswer(true, null), null);
  assert.equal(reasonForInformedAnswer(true, undefined), null);
  assert.equal(reasonForInformedAnswer(true, "sick"), "sick");
  assert.equal(
    reasonForInformedAnswer(true, "no_information"),
    "no_information"
  );

  // Whatever it returns must be submittable.
  assert.ok(ABSENCE_REASONS.includes(reasonForInformedAnswer(false, "sick")));
  assert.equal(
    validateEntry({
      informed: false,
      reason: reasonForInformedAnswer(false, "sick"),
    }).ok,
    true
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

test("summariseDay splits told-us from no-word absences", () => {
  const entries = [
    {
      id: "1",
      attendance_day_id: "d",
      worker_id: "w1",
      informed: true,
      reason: "sick",
      note: null,
      recorded_by: "s",
      created_at: "",
      updated_at: "",
    },
    {
      id: "2",
      attendance_day_id: "d",
      worker_id: "w2",
      informed: false,
      reason: "no_information",
      note: null,
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
  assert.equal(summary.state, "confirmed");
  assert.equal("lentOutCount" in summary, false);
});

test("summariseMonth ranks by absence count desc; zero-absence workers omitted", () => {
  const entries = [
    // Bimal: 2 absences
    entry("b", "Bimal", true),
    entry("b", "Bimal", false),
    // Asha and Chitra: 1 absence each — Asha before Chitra by name
    entry("a", "Asha", true),
    entry("c", "Chitra", false),
  ];

  const ranked = summariseMonth({
    days: [{ id: "d", company: "NKPL" }],
    entries,
  });
  assert.deepEqual(
    ranked.map((r) => r.workerName),
    ["Bimal", "Asha", "Chitra"]
  );
  assert.equal(ranked[0].absenceCount, 2);
  assert.equal(ranked[1].absenceCount, 1);
  assert.equal(ranked[2].absenceCount, 1);
  assert.equal(ranked[0].informedCount, 1);
  assert.equal(ranked[0].uninformedCount, 1);
  assert.equal("lentOutCount" in ranked[0], false);

  // Deactivated / missing worker still named from the absence snapshot.
  const unknownAptus = summariseMonth({
    days: [{ id: "aptus-day", company: "APTUS" }],
    entries: [
      {
        id: "unknown-entry",
        attendance_day_id: "aptus-day",
        worker_id: "missing-worker",
        informed: true,
        reason: "sick",
        note: null,
        recorded_by: "s",
        created_at: "",
        updated_at: "",
        worker_name: "Former Worker",
        worker_designation: "Operator",
      },
    ],
  });
  assert.equal(unknownAptus.length, 1);
  assert.equal(unknownAptus[0].company, "APTUS");
  assert.equal(unknownAptus[0].workerName, "Former Worker");
  assert.equal(unknownAptus[0].designation, "Operator");

  // Quiet month — no rows.
  assert.deepEqual(
    summariseMonth({ days: [{ id: "d", company: "NKPL" }], entries: [] }),
    []
  );
});

test("buildExportRows: one row per absence; no kind or lent column", () => {
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
      informed: true,
      reason: "sick",
      note: null,
      recorded_by: "s1",
      created_at: "",
      updated_at: "",
    },
    {
      id: "e2",
      attendance_day_id: "d2",
      worker_id: "w2",
      informed: false,
      reason: "other",
      note: "bus strike",
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
    informed: true,
    reason: "sick",
    note: null,
    recorded_by_name: "Tapas",
  });
  assert.equal(rows[1].company, "APTUS");
  assert.equal(rows[1].worker_name, "Sita");
  assert.equal(rows[1].informed, false);
  assert.equal(rows[1].reason, "other");
  assert.equal(rows[1].note, "bus strike");
  assert.equal(rows[1].recorded_by_name, "Suraj");
  assert.equal("kind" in rows[0], false);
  assert.equal("lent_to_company" in rows[0], false);
});

test("getAttendanceDayActions: admin always; supervisor pre-lock own company; others never", () => {
  const workDate = "2026-08-03";
  const open = istDate("2026-08-04T09:00:00");
  const locked = istDate("2026-08-04T11:00:00");
  const openDay = { confirmed_at: null, confirmed_by: null };
  const doneDay = {
    confirmed_at: "2026-08-03T12:00:00Z",
    confirmed_by: "s1",
  };
  const admin = { role: "admin", company: null };
  const supNkpl = { role: "supervisor", company: "NKPL" };
  const director = { role: "director", company: null };
  const employee = { role: "employee", company: null };
  const target = { company: "NKPL", workDate };

  // Admin: every control on open day, locked day, and done day.
  const adminOpen = getAttendanceDayActions("admin", admin, target, openDay, open);
  assert.deepEqual(
    {
      showAdd: adminOpen.showAdd,
      showEdit: adminOpen.showEdit,
      showRemove: adminOpen.showRemove,
      showMarkDone: adminOpen.showMarkDone,
      showOpenAgain: adminOpen.showOpenAgain,
    },
    {
      showAdd: true,
      showEdit: true,
      showRemove: true,
      showMarkDone: true,
      showOpenAgain: false,
    }
  );
  const adminLocked = getAttendanceDayActions(
    "admin",
    admin,
    target,
    openDay,
    locked
  );
  assert.equal(adminLocked.showAdd, true);
  assert.equal(adminLocked.isLocked, true);
  const adminDone = getAttendanceDayActions(
    "admin",
    admin,
    target,
    doneDay,
    locked
  );
  assert.equal(adminDone.showAdd, true);
  assert.equal(adminDone.showEdit, true);
  assert.equal(adminDone.showRemove, true);
  assert.equal(adminDone.showMarkDone, false);
  assert.equal(adminDone.showOpenAgain, true);
  assert.equal(adminDone.isDone, true);

  // Supervisor: own company before lock.
  const supOpen = getAttendanceDayActions(
    "supervisor",
    supNkpl,
    target,
    openDay,
    open
  );
  assert.equal(supOpen.showAdd, true);
  assert.equal(supOpen.showMarkDone, true);
  assert.equal(supOpen.showOpenAgain, false);

  // Supervisor: nothing after lock.
  const supLocked = getAttendanceDayActions(
    "supervisor",
    supNkpl,
    target,
    openDay,
    locked
  );
  assert.equal(supLocked.showAdd, false);
  assert.equal(supLocked.showMarkDone, false);
  assert.equal(supLocked.showOpenAgain, false);

  // Supervisor: done day pre-lock — only open again.
  const supDone = getAttendanceDayActions(
    "supervisor",
    supNkpl,
    target,
    doneDay,
    open
  );
  assert.equal(supDone.showAdd, false);
  assert.equal(supDone.showRemove, false);
  assert.equal(supDone.showMarkDone, false);
  assert.equal(supDone.showOpenAgain, true);

  // Supervisor: other company — nothing.
  const supOther = getAttendanceDayActions(
    "supervisor",
    supNkpl,
    { company: "APTUS", workDate },
    openDay,
    open
  );
  assert.equal(supOther.showAdd, false);
  assert.equal(supOther.showOpenAgain, false);

  // Director and employee: nothing, every combination.
  for (const now of [open, locked]) {
    for (const day of [openDay, doneDay, null]) {
      const d = getAttendanceDayActions("director", director, target, day, now);
      const e = getAttendanceDayActions("employee", employee, target, day, now);
      assert.equal(d.showAdd, false);
      assert.equal(d.showMarkDone, false);
      assert.equal(d.showOpenAgain, false);
      assert.equal(e.showAdd, false);
      assert.equal(e.showMarkDone, false);
      assert.equal(e.showOpenAgain, false);
    }
  }
});

function entry(workerId, workerName, informed) {
  return {
    id: `${workerId}-${Math.random()}`,
    attendance_day_id: "d",
    worker_id: workerId,
    informed,
    reason: "sick",
    note: null,
    recorded_by: "s",
    created_at: "",
    updated_at: "",
    worker_name: workerName,
    worker_designation: null,
  };
}
