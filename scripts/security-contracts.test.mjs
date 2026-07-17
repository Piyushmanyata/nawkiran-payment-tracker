import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationDir = join(process.cwd(), "supabase", "migrations");
const migrations = readdirSync(migrationDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const sql = Object.fromEntries(
  migrations.map((name) => [name, readFileSync(join(migrationDir, name), "utf8")])
);

test("the canonical migration chain is ordered and has no bundled duplicate", () => {
  assert.deepEqual(
    migrations.map((name) => name.slice(0, 3)),
    ["001", "002", "003", "004", "005", "006", "007", "008", "009", "010", "011", "012"]
  );
});

test("migrations never provision Auth users or fixed passwords", () => {
  const allSql = Object.values(sql).join("\n").toLowerCase();
  assert.doesNotMatch(allSql, /insert\s+into\s+auth\.(users|identities)/);
  assert.doesNotMatch(allSql, /crypt\s*\(\s*'/);
});

test("denied corrections are requester-scoped except for admins", () => {
  assert.match(
    sql["007_correct_denied_payment.sql"],
    /row\.requested_by\s*<>\s*me\.id\s+and\s+me\.role\s*<>\s*'admin'/i
  );
});

test("admin removal preserves events and remains authenticated-only", () => {
  const migration = sql["009_preserve_admin_delete_audit.sql"];
  assert.match(migration, /admin_deleted/i);
  assert.match(migration, /deleted_at\s*=\s*now\(\)/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.payment_events/i);
  assert.match(migration, /old\.deleted_at\s+is\s+not\s+null/i);
  assert.match(migration, /tg_op\s*=\s*'DELETE'/i);
  assert.match(migration, /before update or delete on public\.payments/i);
  assert.match(migration, /revoke all on function public\.admin_delete_payment\(uuid\) from public/i);
  assert.match(migration, /revoke all on function public\.admin_delete_payment\(uuid\) from anon/i);
});
