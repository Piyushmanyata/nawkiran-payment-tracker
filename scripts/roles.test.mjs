/**
 * Supervisor must be locked out of every payment/to-do capability.
 * Role helpers are allowlists — this pins that contract explicitly.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  autoApprovesOnCreate,
  canApprove,
  canCreatePayment,
  canDeny,
  canDeletePayment,
  canDeleteTodo,
  canEditPayment,
  canEditTodo,
  canMarkPaid,
  getPaymentActions,
} from "../src/lib/roles.ts";

const supervisor = "supervisor";

test("supervisor cannot approve, mark paid, create, edit, or delete payments", () => {
  assert.equal(canApprove(supervisor), false);
  assert.equal(canMarkPaid(supervisor), false);
  assert.equal(canCreatePayment(supervisor), false);
  assert.equal(canDeletePayment(supervisor), false);
  assert.equal(canEditPayment(supervisor), false);
  assert.equal(
    canEditPayment(
      supervisor,
      { status: "pending", requested_by: "sup-1" },
      "sup-1"
    ),
    false
  );
});

test("supervisor cannot edit or delete to-dos", () => {
  const todo = { created_by: "sup-1", recurrence_rule: null };
  assert.equal(canEditTodo(supervisor, todo, "sup-1"), false);
  assert.equal(canDeleteTodo(supervisor), false);
});

test("getPaymentActions exposes no actions for supervisor", () => {
  const handlers = {
    onApprove: () => {},
    onDeny: () => {},
    onMarkPaid: () => {},
    onEdit: () => {},
    onWithdraw: () => {},
    onDelete: () => {},
  };
  for (const status of ["pending", "approved", "denied", "paid", "withdrawn"]) {
    const actions = getPaymentActions(
      { status, requested_by: "sup-1" },
      supervisor,
      handlers,
      "sup-1"
    );
    assert.equal(actions.showApprove, false, status);
    assert.equal(actions.showDeny, false, status);
    assert.equal(actions.showMarkPaid, false, status);
    assert.equal(actions.showEdit, false, status);
    assert.equal(actions.showWithdraw, false, status);
    assert.equal(actions.showDelete, false, status);
  }
});

/** ADR-0013: only a director's create is approved on the spot. */
test("auto-approve on create is director-only", () => {
  assert.equal(autoApprovesOnCreate("director"), true);
  assert.equal(autoApprovesOnCreate("admin"), false);
  assert.equal(autoApprovesOnCreate("employee"), false);
  assert.equal(autoApprovesOnCreate("accounts"), false);
  assert.equal(autoApprovesOnCreate(null), false);
});

test("nobody approves the request they raised themselves", () => {
  const own = { status: "pending", requested_by: "admin-1" };
  const other = { status: "pending", requested_by: "emp-1" };

  assert.equal(canApprove("admin"), true, "role-level capability is unchanged");
  assert.equal(canApprove("admin", own, "admin-1"), false);
  assert.equal(canApprove("admin", other, "admin-1"), true);
  assert.equal(canApprove("director", other, "dir-1"), true);
  // The guard is role-agnostic, matching the server. It never bites a director
  // in practice: their creates auto-approve, so they never reach pending.
  assert.equal(canApprove("director", { requested_by: "dir-1" }, "dir-1"), false);

  // Deny is not an authorisation — it stays open to the requester.
  assert.equal(canDeny("admin"), true);
});

test("an admin viewing their own pending request sees Deny but not Approve", () => {
  const handlers = {
    onApprove: () => {},
    onDeny: () => {},
    onMarkPaid: () => {},
    onEdit: () => {},
    onWithdraw: () => {},
    onDelete: () => {},
  };
  const own = { status: "pending", requested_by: "admin-1" };

  const mine = getPaymentActions(own, "admin", handlers, "admin-1");
  assert.equal(mine.showApprove, false);
  assert.equal(mine.showDeny, true);

  const theirs = getPaymentActions(
    { status: "pending", requested_by: "emp-1" },
    "admin",
    handlers,
    "admin-1"
  );
  assert.equal(theirs.showApprove, true);
  assert.equal(theirs.showDeny, true);
});
