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
    migrations.slice(0, 14).map((name) => name.slice(0, 3)),
    ["001", "002", "003", "004", "005", "006", "007", "008", "009", "010", "011", "012", "013", "014"]
  );
  assert.equal(
    migrations.filter((name) => name.endsWith("_audit_names_push_hardening.sql")).length,
    1
  );
});

test("push target window is long enough for delayed server actions", () => {
  assert.match(sql["014_push_reliability.sql"], /2 hours/i);
  assert.match(sql["014_push_reliability.sql"], /list_push_targets/i);
});

test("migrations never provision Auth users or fixed passwords", () => {
  const allSql = Object.values(sql).join("\n").toLowerCase();
  assert.doesNotMatch(allSql, /insert\s+into\s+auth\.(users|identities)/);
  assert.doesNotMatch(allSql, /crypt\s*\(\s*'/);
});

test("denied corrections are requester-scoped except for admins", () => {
  const hardening = migrations.find((name) =>
    name.endsWith("_audit_names_push_hardening.sql")
  );
  assert.match(
    sql[hardening],
    /row\.requested_by\s*<>\s*me\.id\s+and\s+me\.role\s*<>\s*'admin'/i
  );
});

test("push targets are restricted to the lifecycle actor", () => {
  const hardening = migrations.find((name) =>
    name.endsWith("_audit_names_push_hardening.sql")
  );
  assert.match(sql[hardening], /actor_id\s*<>\s*me/i);
  assert.match(sql[hardening], /e\.performed_by,\s*e\.created_at/i);
  assert.doesNotMatch(sql[hardening], /pay\.status\s*=\s*'(pending|approved|denied|paid)'/i);
  assert.match(
    sql[hardening],
    /drop function if exists public\.delete_stale_push_subscription\(text, uuid, text\)/i
  );
  assert.doesNotMatch(sql[hardening], /create function public\.delete_stale_push_subscription/i);
  assert.doesNotMatch(sql[hardening], /using \(user_id = auth\.uid\(\)\)/i);
});

test("push workflow routes director vs employees correctly", () => {
  const workflow = migrations.find((name) =>
    name.endsWith("_push_notification_workflow.sql")
  );
  assert.ok(workflow, "push_notification_workflow migration missing");
  const body = sql[workflow];
  assert.match(body, /when 'pending' then array\['director', 'admin'\]/i);
  assert.match(body, /when 'approved' then array\['employee', 'accounts'\]/i);
  assert.match(body, /when 'denied' then array\['employee', 'accounts'\]/i);
  assert.match(body, /when 'paid' then array\['director', 'admin'\]/i);
  assert.match(body, /s\.user_id\s*<>\s*me/i);
  assert.doesNotMatch(body, /s\.user_id\s*=\s*pay\.requested_by/i);
});

test("director auto-approve create notifies employees via approved targets", () => {
  const latest = migrations.find((name) =>
    name.endsWith("_push_director_initiate_employees.sql")
  );
  assert.ok(latest, "push_director_initiate_employees migration missing");
  const body = sql[latest];
  assert.match(
    body,
    /e\.action\s*=\s*'created'\s+and\s+e\.new_status\s*=\s*'approved'/i
  );
  assert.match(body, /when 'approved' then array\['employee', 'accounts'\]/i);

  const client = readFileSync(
    join(process.cwd(), "src", "lib", "push-client.ts"),
    "utf8"
  );
  assert.match(client, /payment\.status\s*===\s*"approved"\s*\|\|\s*payment\.approved_by/i);
});

test("push payload always includes party amount and initiator", () => {
  const push = readFileSync(join(process.cwd(), "src", "lib", "push.ts"), "utf8");
  const action = readFileSync(
    join(process.cwd(), "src", "app", "actions", "push.ts"),
    "utf8"
  );
  assert.match(push, /export type PaymentPushParams/i);
  assert.match(push, /initiatedBy/i);
  assert.match(push, /party} · \$\{amount} · by \$\{by}/);
  assert.match(action, /profiles!payments_requested_by_fkey\(full_name\)/i);
  assert.match(action, /initiatedBy:/i);
});

test("mobile push rotation works without an open app window", () => {
  const worker = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
  assert.match(worker, /pushsubscriptionchange/i);
  assert.match(worker, /pushManager\.subscribe/i);
  assert.match(worker, /\/api\/push\/subscription/i);
  assert.match(worker, /credentials:\s*"include"/i);
});

test("payment notification delivery is deferred and bounded", () => {
  const action = readFileSync(
    join(process.cwd(), "src", "app", "actions", "push.ts"),
    "utf8"
  );
  const delivery = readFileSync(join(process.cwd(), "src", "lib", "push.ts"), "utf8");
  assert.match(action, /after\s*\(\s*async/i);
  assert.match(delivery, /timeout:\s*7_000/i);
  assert.match(delivery, /attempt\s*<\s*3/i);
});

test("Apple push uses a valid VAPID contact and failed tests clean up", () => {
  const action = readFileSync(
    join(process.cwd(), "src", "app", "actions", "push.ts"),
    "utf8"
  );
  const delivery = readFileSync(join(process.cwd(), "src", "lib", "push.ts"), "utf8");
  assert.match(delivery, /https:\/\/nawkiran-payment-tracker\.vercel\.app/i);
  assert.match(delivery, /web\.push\.apple\.com/i);
  assert.match(delivery, /subject:\s*vapidSubject\(subscription\.endpoint\)/i);
  assert.match(delivery, /subject:\s*vapidSubject\(data\.endpoint\)/i);
  assert.doesNotMatch(delivery, /mailto:admin@nawkiran\.local/i);
  assert.match(delivery, /mailto:<\(\[\^<>\]\+\)>/i);
  assert.match(action, /sendTestNotification cleanup/i);
  assert.match(action, /removePushSubscription\(endpoint\)/i);
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

test("gone push endpoints are purged after terminal delivery failures", () => {
  const purge = migrations.find((name) =>
    name.endsWith("_purge_gone_push_endpoints.sql")
  );
  assert.ok(purge, "purge_gone_push_endpoints migration missing");
  assert.match(sql[purge], /create or replace function public\.purge_push_endpoint/i);
  assert.match(sql[purge], /delete from public\.push_subscriptions/i);
  assert.match(sql[purge], /revoke all on function public\.purge_push_endpoint\(text\) from public, anon/i);
  assert.match(sql[purge], /grant execute on function public\.purge_push_endpoint\(text\) to authenticated/i);

  const delivery = readFileSync(join(process.cwd(), "src", "lib", "push.ts"), "utf8");
  assert.match(delivery, /purge_push_endpoint/i);
  assert.match(delivery, /status === 404 \|\| status === 410|lastStatus === 404 \|\| lastStatus === 410/);
  assert.match(delivery, /"gone"/);
});
