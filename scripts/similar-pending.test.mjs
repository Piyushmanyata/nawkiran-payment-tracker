import assert from "node:assert/strict";
import test from "node:test";
import {
  exactAmount,
  isSimilarPendingMatch,
  normalizeParty,
  partiesSimilar,
} from "../src/lib/similar-pending.ts";

test("normalizeParty trims, collapses spaces, lowercases", () => {
  assert.equal(normalizeParty("  ABC   Suppliers  "), "abc suppliers");
  assert.equal(normalizeParty("NKPL"), "nkpl");
  assert.equal(normalizeParty("  "), "");
});

test("partiesSimilar: exact normalized equal", () => {
  assert.equal(partiesSimilar("ABC Suppliers", "abc  suppliers"), true);
  assert.equal(partiesSimilar("NKPL", "nkpl"), true);
});

test("partiesSimilar: contains when shorter name is at least 5 chars", () => {
  assert.equal(partiesSimilar("ABC Suppliers Pvt Ltd", "ABC Suppliers"), true);
  assert.equal(partiesSimilar("APTUS Systems", "APTUS"), true);
  assert.equal(partiesSimilar("foo", "foobar baz"), false); // shorter "foo" length 3
});

test("partiesSimilar: short-name floor requires equality", () => {
  assert.equal(partiesSimilar("AB", "AB"), true);
  assert.equal(partiesSimilar("AB", "ABC"), false);
  assert.equal(partiesSimilar("NKPL", "NKPL India"), false); // 4 chars < 5
  assert.equal(partiesSimilar("APTUS", "APTUS India"), true); // 5 chars
});

test("partiesSimilar: empty never matches", () => {
  assert.equal(partiesSimilar("", "anything"), false);
  assert.equal(partiesSimilar("  ", "x"), false);
});

test("exactAmount compares at 2 decimal places", () => {
  assert.equal(exactAmount(100, 100), true);
  assert.equal(exactAmount(100.1, 100.1), true);
  assert.equal(exactAmount(100.1, 100.1), true);
  assert.equal(exactAmount(100.001, 100), true); // both round to 100.00
  assert.equal(exactAmount(100.01, 100.02), false);
  assert.equal(exactAmount("50.50", 50.5), true);
});

test("isSimilarPendingMatch requires pending + exact amount + similar party", () => {
  const input = { party: "ABC Suppliers", amount: 1000 };

  assert.equal(
    isSimilarPendingMatch(
      { party: "ABC Suppliers Pvt", amount: 1000, status: "pending" },
      input
    ),
    true
  );
  assert.equal(
    isSimilarPendingMatch(
      { party: "ABC Suppliers", amount: 1000, status: "approved" },
      input
    ),
    false
  );
  assert.equal(
    isSimilarPendingMatch(
      { party: "ABC Suppliers", amount: 1000, status: "denied" },
      input
    ),
    false
  );
  assert.equal(
    isSimilarPendingMatch(
      { party: "ABC Suppliers", amount: 1000, status: "paid" },
      input
    ),
    false
  );
  assert.equal(
    isSimilarPendingMatch(
      { party: "ABC Suppliers", amount: 999, status: "pending" },
      input
    ),
    false
  );
  assert.equal(
    isSimilarPendingMatch(
      { party: "Other Vendor Completely", amount: 1000, status: "pending" },
      input
    ),
    false
  );
  // own pending still matches (no requester filter in pure helper)
  assert.equal(
    isSimilarPendingMatch(
      { party: "abc suppliers", amount: 1000, status: "pending" },
      input
    ),
    true
  );
});
