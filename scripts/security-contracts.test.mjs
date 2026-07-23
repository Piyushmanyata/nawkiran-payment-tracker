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

test("staff can edit unpaid payments via edit_unpaid_payment", () => {
  const migration = sql["015_edit_unpaid_payment.sql"];
  assert.ok(migration, "015_edit_unpaid_payment migration missing");
  assert.match(migration, /create or replace function public\.edit_unpaid_payment/i);
  assert.match(migration, /me\.role not in \('employee', 'director', 'accounts', 'admin'\)/i);
  assert.match(migration, /if row\.status = 'paid'/i);
  assert.match(migration, /event_action := 'edited'/i);
  assert.match(migration, /event_action := 'resubmitted'/i);
  assert.match(migration, /grant execute on function public\.edit_unpaid_payment/i);
  assert.match(migration, /revoke all on function public\.edit_unpaid_payment/i);
});

test("employees cannot edit director-requested payments", () => {
  const migration = sql["016_director_edit_guard_and_speed.sql"];
  assert.ok(migration, "016_director_edit_guard_and_speed migration missing");
  assert.match(migration, /me\.role in \('employee', 'accounts'\)/i);
  assert.match(migration, /requester_role = 'director'/i);
  assert.match(migration, /raise exception 'NOT_AUTHORISED'/i);
  assert.match(migration, /payments_active_status_requested_at_idx/i);

  const roles = readFileSync(join(process.cwd(), "src", "lib", "roles.ts"), "utf8");
  assert.match(roles, /requester_role === "director"/);
  assert.match(roles, /role === "director" \|\| role === "admin"/);
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

test("push payload labels the correct actor per event", () => {
  const push = readFileSync(join(process.cwd(), "src", "lib", "push.ts"), "utf8");
  const action = readFileSync(
    join(process.cwd(), "src", "app", "actions", "push.ts"),
    "utf8"
  );
  assert.match(push, /export type PaymentPushParams/i);
  assert.match(push, /actorName/i);
  assert.match(push, /Requested by \$\{actor\}/);
  assert.match(push, /Approved by \$\{actor\}/);
  assert.match(push, /Denied by \$\{actor\}/);
  assert.match(push, /Marked paid by \$\{actor\}/);
  assert.match(push, /tagPrefix:\s*"req"/);
  assert.match(push, /tagPrefix:\s*"appr"/);
  assert.match(push, /tagPrefix:\s*"deny"/);
  assert.match(push, /tagPrefix:\s*"paid"/);
  assert.match(action, /payment_push_context/i);
  assert.match(action, /actorName:/i);
  assert.match(action, /tagPrefix/);
});

test("payment_push_context resolves lifecycle actors", () => {
  const migration = sql["017_push_actor_context.sql"];
  assert.ok(migration, "017_push_actor_context migration missing");
  assert.match(migration, /create or replace function public\.payment_push_context/i);
  assert.match(migration, /e\.action in \('created', 'resubmitted'\)/i);
  assert.match(migration, /e\.action = 'approved'/i);
  assert.match(migration, /when 'paid' then p\.paid_by/i);
  assert.match(migration, /grant execute on function public\.payment_push_context/i);
  assert.match(migration, /payment_events_payment_action_id_idx/i);
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

test("monthly hard-delete retention; history UI groups by day", () => {
  const soft = sql["018_history_weekly_retention.sql"];
  assert.ok(soft, "018_history_weekly_retention migration missing");
  assert.match(soft, /create or replace function public\.purge_old_payment_history/i);

  const hard = sql["019_history_hard_delete_retention.sql"];
  assert.ok(hard, "019_history_hard_delete_retention migration missing");
  assert.match(hard, /delete from public\.payment_events/i);
  assert.match(hard, /delete from public\.payments/i);
  assert.match(hard, /app\.allow_history_purge/i);

  const monthly = sql["020_history_monthly_hard_delete.sql"];
  assert.ok(monthly, "020_history_monthly_hard_delete migration missing");
  assert.match(monthly, /p_keep_days integer default 30/i);
  assert.match(monthly, /coalesce\(p_keep_days, 30\)/i);
  assert.match(monthly, /status in \('paid', 'denied'\)/i);
  assert.match(monthly, /grant execute on function public\.purge_old_payment_history/i);

  const paymentsLib = readFileSync(
    join(process.cwd(), "src", "lib", "payments.ts"),
    "utf8"
  );
  assert.match(paymentsLib, /HISTORY_KEEP_DAYS = 30/);

  const historyDays = readFileSync(
    join(process.cwd(), "src", "lib", "history-weeks.ts"),
    "utf8"
  );
  assert.match(historyDays, /groupHistoryByDay/);
  assert.match(historyDays, /Today/);
  assert.match(historyDays, /Yesterday/);
  assert.match(historyDays, /isToday/);

  const historyPage = readFileSync(
    join(process.cwd(), "src", "app", "history", "page.tsx"),
    "utf8"
  );
  assert.match(historyPage, /HistoryWeekList|HistoryDayList/);
  assert.match(historyPage, /maybePurgeOldHistory/);
  assert.match(historyPage, /30 days/);
  assert.match(historyPage, /grouped by day/i);
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

test("admin receives all payment push events", () => {
  const migration = migrations.find((name) =>
    name.endsWith("_admin_all_push_notifications.sql")
  );
  assert.ok(migration, "admin_all_push_notifications migration missing");
  const body = sql[migration];
  assert.match(body, /when 'approved' then array\['employee', 'accounts', 'admin'\]/i);
  assert.match(body, /when 'denied' then array\['employee', 'accounts', 'admin'\]/i);
  assert.match(body, /when 'pending' then array\['director', 'admin'\]/i);
  assert.match(body, /when 'paid' then array\['director', 'admin'\]/i);
  assert.match(body, /s\.user_id\s*<>\s*me/i);
});

test("party tags detect APTUS and NKPL with typos", () => {
  const tagLib = readFileSync(
    join(process.cwd(), "src", "lib", "party-tag.ts"),
    "utf8"
  );
  assert.match(tagLib, /export type PartyTag = "APTUS" \| "NKPL"/);
  assert.match(tagLib, /detectPartyTags/);
  assert.match(tagLib, /editDistance/);
  assert.match(tagLib, /atpus/);
  assert.match(tagLib, /nklp/);
  assert.doesNotMatch(tagLib, /ATPUS/);

  const form = readFileSync(
    join(process.cwd(), "src", "components", "AddPaymentForm.tsx"),
    "utf8"
  );
  assert.match(form, /detectPartyTags/);
  assert.match(form, /APTUS/);
  assert.match(form, /NKPL/);

  const pushBar = readFileSync(
    join(process.cwd(), "src", "components", "PushNotifications.tsx"),
    "utf8"
  );
  assert.match(pushBar, /status === "on"/);
  assert.match(pushBar, /return null/);
});

test("team to-dos: RPCs, freeze done, admin delete, 30-day purge", () => {
  const migration = sql["023_todos.sql"];
  assert.ok(migration, "023_todos migration missing");
  assert.match(migration, /create table public\.todos/i);
  assert.match(migration, /create table public\.todo_assignees/i);
  assert.match(migration, /create or replace function public\.create_todo/i);
  assert.match(migration, /create or replace function public\.update_todo/i);
  assert.match(migration, /create or replace function public\.complete_todo/i);
  assert.match(migration, /create or replace function public\.delete_todo/i);
  assert.match(migration, /create or replace function public\.purge_old_todos/i);
  assert.match(migration, /me\.role not in \('director', 'admin'\)/i);
  assert.match(migration, /me\.role <> 'admin'/i);
  assert.match(migration, /TODO_FROZEN|status <> 'open'/i);
  assert.match(migration, /status = 'done'/i);
  assert.match(migration, /grant execute on function public\.create_todo/i);
  assert.match(migration, /revoke all on function public\.create_todo/i);
  assert.match(migration, /alter publication supabase_realtime\s+add table public\.todos/i);

  const roles = readFileSync(join(process.cwd(), "src", "lib", "roles.ts"), "utf8");
  assert.match(roles, /canEditTodo/);
  assert.match(roles, /canDeleteTodo/);
  assert.match(roles, /role === "director" \|\| role === "admin"/);
});

test("todo assign push requires todo assignee membership", () => {
  const migration = sql["024_todo_push_harden_and_overdue.sql"];
  assert.ok(migration, "024_todo_push_harden_and_overdue migration missing");
  assert.match(migration, /drop function if exists public\.list_todo_push_targets\(uuid\[\]\)/i);
  assert.match(migration, /list_todo_push_targets\(\s*p_todo_id uuid/i);
  assert.match(migration, /from public\.todo_assignees ta/i);
  assert.match(migration, /list_my_overdue_todo_titles/i);
  assert.match(migration, /due_date < \(timezone\('Asia\/Kolkata'/i);
  assert.match(migration, /grant execute on function public\.list_todo_push_targets\(uuid, uuid\[\]\)/i);
  assert.match(migration, /grant execute on function public\.list_my_overdue_todo_titles\(\)/i);
});
