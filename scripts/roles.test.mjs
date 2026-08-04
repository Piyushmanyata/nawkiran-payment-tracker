/**
 * Supervisor must be locked out of every payment/to-do capability.
 * Role helpers are allowlists — this pins that contract explicitly.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canApprove,
  canCreatePayment,
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
    assert.equal(actions.showMarkPaid, false, status);
    assert.equal(actions.showEdit, false, status);
    assert.equal(actions.showWithdraw, false, status);
    assert.equal(actions.showDelete, false, status);
  }
});
