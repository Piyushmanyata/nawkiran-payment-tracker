import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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

test("employees edit only own pending/denied via edit_unpaid_payment", () => {
  const migration = sql["20260725120000_employee_edit_own_pending_denied.sql"];
  assert.ok(migration, "employee edit own pending/denied migration missing");
  assert.match(migration, /create or replace function public\.edit_unpaid_payment/i);
  assert.match(migration, /me\.role in \('employee', 'accounts'\)/i);
  assert.match(migration, /row\.requested_by is distinct from me\.id/i);
  assert.match(migration, /row\.status = 'approved'/i);
  assert.match(migration, /raise exception 'NOT_AUTHORISED'/i);
  assert.match(migration, /if row\.status = 'paid'/i);

  const roles = readFileSync(join(process.cwd(), "src", "lib", "roles.ts"), "utf8");
  assert.match(roles, /payment\.status === "approved"/);
  assert.match(roles, /payment\.requested_by !== userId/);
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

test("directors and admins soft-delete via delete_payment", () => {
  const migration = sql["20260731120000_delete_payment.sql"];
  assert.ok(migration, "delete_payment migration missing");
  assert.match(migration, /create or replace function public\.delete_payment/i);
  assert.match(migration, /me\.role not in \('director', 'admin'\)/i);
  assert.match(
    migration,
    /row\.status not in \('approved', 'paid', 'denied', 'withdrawn'\)/i
  );
  assert.match(migration, /raise exception 'NOT_DELETABLE'/i);
  assert.match(migration, /'deleted'/i);
  assert.match(migration, /drop function if exists public\.admin_delete_payment/i);
  assert.match(migration, /revoke all on function public\.delete_payment\(uuid\) from public/i);
  assert.match(migration, /grant execute on function public\.delete_payment\(uuid\) to authenticated/i);
  // Approved-delete push only: server gates status + employees/accounts.
  assert.match(migration, /event_clean = 'deleted'/i);
  assert.match(migration, /pay\.status = 'approved'/i);
  assert.match(migration, /p\.role in \('employee', 'accounts'\)/i);
  assert.match(migration, /p\.deleted_at is null or event_clean = 'deleted'/i);

  const roles = readFileSync(join(process.cwd(), "src", "lib", "roles.ts"), "utf8");
  assert.match(roles, /canDeletePayment/);
  assert.match(roles, /role === "director" \|\| role === "admin"/);
  assert.match(roles, /payment\.status === "approved"/);

  const paymentsLib = readFileSync(
    join(process.cwd(), "src", "lib", "payments.ts"),
    "utf8"
  );
  assert.match(paymentsLib, /delete_payment/);
  assert.match(paymentsLib, /priorStatus === "approved"/);
  assert.doesNotMatch(paymentsLib, /admin_delete_payment/);

  const openPage = readFileSync(
    join(process.cwd(), "src", "app", "open", "page.tsx"),
    "utf8"
  );
  assert.match(openPage, /window\.confirm/);
  assert.match(openPage, /onDelete=\{userCanDelete/);
  // Drawer-only: history cards must not receive delete handlers.
  const historyBlock = openPage.match(/<HistoryWeekList[\s\S]*?\/>/);
  assert.ok(historyBlock, "HistoryWeekList usage missing");
  assert.doesNotMatch(historyBlock[0], /onDelete/);
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
    join(process.cwd(), "src", "app", "open", "page.tsx"),
    "utf8"
  );
  assert.match(historyPage, /HistoryWeekList|HistoryDayList/);
  assert.match(historyPage, /maybePurgeOldHistory/);
});

test("denied requests stay open for their requester until paid or withdrawn", () => {
  const enumMigration = sql["20260728100000_payment_withdrawn_enum.sql"];
  assert.ok(enumMigration, "payment_withdrawn_enum migration missing");
  assert.match(
    enumMigration,
    /alter type public\.payment_status add value if not exists 'withdrawn'/i
  );
  assert.match(enumMigration, /'withdrawn',\s*\n\s*'admin_deleted'/i);
  // The label must land in its own migration: Postgres cannot use a new enum
  // value in the transaction that adds it.
  assert.doesNotMatch(enumMigration, /create or replace function/i);

  const migration = sql["20260728100100_withdraw_payment_and_open_denials.sql"];
  assert.ok(migration, "withdraw_payment_and_open_denials migration missing");
  assert.match(migration, /create or replace function public\.withdraw_payment/i);
  // Requester-only, denied-only.
  assert.match(migration, /row\.requested_by is distinct from me\.id/i);
  assert.match(migration, /row\.status <> 'denied'/i);
  assert.match(migration, /raise exception 'NOT_DENIED'/i);
  assert.match(migration, /revoke all on function public\.withdraw_payment\(uuid\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.withdraw_payment\(uuid\) to authenticated/i);
  // Withdrawn is terminal for edits, and admin cleanup covers it.
  assert.match(migration, /row\.status in \('paid', 'withdrawn'\)/i);
  assert.match(migration, /not in \('paid', 'denied', 'withdrawn'\)/i);
  // Retention must never hard-delete a live denial.
  assert.match(migration, /status in \('paid', 'withdrawn'\)\s*\n\s*and coalesce\(paid_at, updated_at\) < cutoff/i);

  const paymentsLib = readFileSync(
    join(process.cwd(), "src", "lib", "payments.ts"),
    "utf8"
  );
  assert.match(paymentsLib, /export async function withdrawPayment/);
  assert.match(paymentsLib, /export function needsMyAction/);
  // Open/history split is viewer-aware, not status-only.
  assert.match(paymentsLib, /isOpenPayment\(\s*payment: ViewedPayment,\s*userId\?: string \| null\s*\)/);
  assert.match(paymentsLib, /payment\.status === "denied" &&\s*\n\s*Boolean\(userId\) &&\s*\n\s*payment\.requested_by === userId/);
  assert.match(paymentsLib, /payment\.status === "paid" \|\| payment\.status === "withdrawn"/);

  const roles = readFileSync(join(process.cwd(), "src", "lib", "roles.ts"), "utf8");
  assert.match(roles, /showWithdraw/);
  assert.match(roles, /function isSettledPayment/);
});

test("each dataset has exactly one Realtime channel", () => {
  const realtime = readFileSync(
    join(process.cwd(), "src", "lib", "realtime.ts"),
    "utf8"
  );
  assert.match(realtime, /export function subscribeTables/);
  assert.match(realtime, /subscribeTables\("payments-live", \["payments"\]/);
  assert.match(realtime, /subscribeTables\("todos-live", \["todos", "todo_threads"\]/);

  // The nav badge must read from the shared provider, never open its own channel.
  const nav = readFileSync(
    join(process.cwd(), "src", "components", "BottomNavigation.tsx"),
    "utf8"
  );
  assert.match(nav, /useTodos/);
  assert.doesNotMatch(nav, /\.channel\(/);

  const todoPage = readFileSync(
    join(process.cwd(), "src", "app", "todo", "page.tsx"),
    "utf8"
  );
  assert.doesNotMatch(todoPage, /\.channel\(/);
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
  assert.match(tagLib, /EXACT\[whole\]/);
  assert.doesNotMatch(tagLib, /for \([^)]*slice[^)]*\)/);

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
  assert.match(migration, /grant execute on function public\.list_todo_push_targets\(uuid, uuid\[\]\)/i);
  assert.match(migration, /grant execute on function public\.list_my_overdue_todo_titles\(\)/i);
});

test("employee request privacy and push targeting migration", () => {
  const migration = sql["20260723210600_employee_request_privacy_and_push.sql"];
  assert.ok(migration, "20260723210600_employee_request_privacy_and_push migration missing");
  assert.match(migration, /me_role in \('director', 'admin'\)/i);
  assert.match(migration, /p\.status in \('approved', 'paid'\)/i);
  assert.match(migration, /p\.requested_by = me_id/i);
  assert.match(migration, /status in \('approved', 'paid'\)/i);
  assert.match(migration, /requested_by = auth\.uid\(\)/i);
  assert.match(migration, /s\.user_id = pay\.requested_by or p\.role = 'admin'/i);
});

test("recurring reminders start of day migration contract", () => {
  const migration = sql["20260724132000_recurring_reminders_start_of_day.sql"];
  assert.ok(migration, "20260724132000_recurring_reminders_start_of_day migration missing");
  assert.match(migration, /create or replace function public\.list_my_overdue_todo_titles/i);
  assert.match(migration, /recurrence_rule->>'type' <> 'none'/i);
  assert.match(migration, /extract\(hour from timezone\('Asia\/Kolkata', now\(\)\)\) >= 12/i);
  assert.match(migration, /grant execute on function public\.list_my_overdue_todo_titles\(\)/i);
});

test("overdue push targets all responsible users across the team", () => {
  const migration = sql["20260724134000_overdue_todo_push_all_targets.sql"];
  assert.ok(migration, "20260724134000_overdue_todo_push_all_targets migration missing");
  assert.match(migration, /create or replace function public\.list_overdue_todo_push_targets/i);
  // Returns per-user title arrays (not just caller)
  assert.match(migration, /returns table/i);
  assert.match(migration, /user_id.*uuid/i);
  assert.match(migration, /titles.*text\[\]/i);
  // Both assignee and initiator-if-none paths are covered
  assert.match(migration, /todo_assignees/i);
  assert.match(migration, /created_by/i);
  assert.match(migration, /not exists/i);
  // Security: security definer + grant/revoke
  assert.match(migration, /security definer/i);
  assert.match(migration, /grant execute on function public\.list_overdue_todo_push_targets/i);
  assert.match(migration, /revoke all on function public\.list_overdue_todo_push_targets/i);
  // 12pm IST rule for recurring items preserved
  assert.match(migration, /extract\(hour from timezone\('Asia\/Kolkata', now\(\)\)\) >= 12/i);
});

test("is_todo_overdue_ist helper eliminates duplicate overdue predicates", () => {
  const migration = sql["20260724140000_extract_overdue_ist_helper.sql"];
  assert.ok(migration, "20260724140000_extract_overdue_ist_helper migration missing");
  // Helper function exists
  assert.match(migration, /create or replace function public\.is_todo_overdue_ist/i);
  // Both RPCs are rewritten using the helper
  assert.match(migration, /create or replace function public\.list_my_overdue_todo_titles/i);
  assert.match(migration, /create or replace function public\.list_overdue_todo_push_targets/i);
  // Helper used in both RPCs (not the raw predicate)
  assert.match(migration, /public\.is_todo_overdue_ist\(t\)/i);
  // Security: definer on RPCs, invoker on helper
  assert.match(migration, /security invoker/i);
  assert.match(migration, /security definer/i);
});

test("recurring to-dos edit permission and completion due date guard migration contract", () => {
  const migration = sql["20260724150000_recurring_todo_permissions_and_completion_guard.sql"];
  assert.ok(migration, "20260724150000_recurring_todo_permissions_and_completion_guard migration missing");
  assert.match(migration, /create or replace function public\.update_todo/i);
  assert.match(migration, /create or replace function public\.complete_todo/i);
  assert.match(migration, /me\.id <> row\.created_by and me\.role <> 'admin'/i);
  assert.match(migration, /row\.due_date > today_ist/i);
  assert.match(migration, /RECURRING_NOT_DUE/i);
});

test("similar pending match is boolean-only and privileged", () => {
  const migration = sql["20260724160000_similar_pending_match.sql"];
  assert.ok(migration, "20260724160000_similar_pending_match migration missing");
  assert.match(migration, /create or replace function public\.has_similar_pending_payment/i);
  assert.match(migration, /returns boolean/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /p\.status = 'pending'/i);
  assert.match(migration, /public\.parties_similar/i);
  assert.match(migration, /char_length\(shorter\) < 5/i);
  assert.match(migration, /position\(shorter in longer\) > 0/i);
  assert.match(migration, /grant execute on function public\.has_similar_pending_payment/i);
  assert.match(migration, /revoke all on function public\.has_similar_pending_payment/i);
  // Helper must not be client-callable
  assert.match(migration, /revoke all on function public\.parties_similar\(text, text\) from public, anon, authenticated/i);
  // Must not select/return payment row fields from the public RPC
  assert.doesNotMatch(migration, /has_similar_pending_payment[\s\S]*returns public\.payments/i);
  assert.match(migration, /payments_pending_amount_idx/i);

  const client = readFileSync(join(process.cwd(), "src", "lib", "payments.ts"), "utf8");
  assert.match(client, /has_similar_pending_payment/i);
  assert.match(client, /export async function hasSimilarPendingPayment/i);

  const form = readFileSync(
    join(process.cwd(), "src", "components", "AddPaymentForm.tsx"),
    "utf8"
  );
  assert.match(form, /hasSimilarPendingPayment/);
  assert.match(form, /similar open request may already exist/i);
  assert.match(form, /!autoApprove/);
  assert.doesNotMatch(form, /requester_name.*confirm|confirm.*amount.*party/i);
});

test("supervisor role and company dimension are constrained on profiles", () => {
  const migration = sql["20260804120000_supervisor_role_and_company.sql"];
  assert.ok(migration, "supervisor role and company migration missing");
  assert.match(
    migration,
    /role in \('employee', 'director', 'accounts', 'admin', 'supervisor'\)/i
  );
  assert.match(migration, /company in \('NKPL', 'APTUS'\)/i);
  assert.match(
    migration,
    /role <> 'supervisor' or company is not null/i
  );

  const types = readFileSync(
    join(process.cwd(), "src", "types", "database.ts"),
    "utf8"
  );
  assert.match(types, /"supervisor"/);
  assert.match(types, /export type Company = "NKPL" \| "APTUS"/);
  assert.match(types, /company: Company \| null/);

  const roles = readFileSync(join(process.cwd(), "src", "lib", "roles.ts"), "utf8");
  // Explicit deny — never grant payment/to-do capability via creator short-circuit.
  assert.match(roles, /role === "supervisor"\) return false/);
});

test("supervisors cannot read payments, payment events, or to-dos", () => {
  const migration = sql["20260804130000_supervisor_read_isolation.sql"];
  assert.ok(migration, "supervisor read isolation migration missing");

  for (const policy of [
    "payments_select",
    "payment_events_select",
    "todos_select",
    "todo_assignees_select",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `create policy ${policy}[\\s\\S]*?using \\([\\s\\S]*?my_role\\(\\)\\s*<>\\s*'supervisor'`,
        "i"
      ),
      `${policy} must exclude supervisors`
    );
  }
});

test("attendance schema: tables, checks, select-only RLS, supervisor company scope", () => {
  const migration = sql["20260804120100_attendance_schema.sql"];
  assert.ok(migration, "attendance schema migration missing");

  for (const table of [
    "workers",
    "attendance_days",
    "attendance_entries",
    "attendance_events",
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`, "i"));
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`, "i")
    );
    assert.match(
      migration,
      new RegExp(`create policy ${table}_select`, "i")
    );
  }

  // Absence-only kinds — never a "present" mark.
  assert.match(migration, /kind in \('absent', 'weekly_off', 'lent_out'\)/i);
  assert.doesNotMatch(migration, /'present'/i);

  // Absent requires informed + reason; other kinds forbid them.
  assert.match(migration, /attendance_entries_absent_fields_check/i);
  assert.match(migration, /attendance_entries_other_note_check/i);
  assert.match(migration, /attendance_entries_lent_check/i);

  // One day+shift per company.
  assert.match(migration, /unique \(company, work_date, shift\)/i);
  assert.match(migration, /unique \(attendance_day_id, worker_id\)/i);

  // Select policies: staff see all; supervisor only own company.
  assert.match(
    migration,
    /my_role\(\) in \('employee', 'director', 'accounts', 'admin'\)/i
  );
  assert.match(migration, /my_role\(\) = 'supervisor'/i);
  assert.match(
    migration,
    /company = \(\s*select p\.company from public\.profiles p where p\.id = auth\.uid\(\)/i
  );

  // Entries/events scope supervisor via attendance_days join (no company col).
  assert.match(
    migration,
    /exists \(\s*select 1\s+from public\.attendance_days d\s+where d\.id = attendance_day_id/i
  );

  // Supabase Data API grants are explicit for newly created public tables.
  assert.match(
    migration,
    /grant select on public\.workers,\s*public\.attendance_days,\s*public\.attendance_entries,\s*public\.attendance_events\s+to authenticated/i
  );

  // No direct write policies — writes are Phase 3 security definer RPCs.
  assert.doesNotMatch(migration, /for insert/i);
  assert.doesNotMatch(migration, /for update/i);
  assert.doesNotMatch(migration, /for delete/i);
});

test("attendance RPCs: lock helper, role allowlists, audit, company fences", () => {
  const migration = sql["20260804120200_attendance_rpcs.sql"];
  assert.ok(migration, "attendance RPCs migration missing");

  // Lock: 10:00 IST on D+1, computed not stored.
  assert.match(migration, /create or replace function public\.attendance_locked/i);
  assert.match(migration, /Asia\/Kolkata/i);
  assert.match(migration, /time '10:00'/i);
  assert.doesNotMatch(migration, /is_locked|locked_at/i);

  const rpcs = [
    ["upsert_attendance_entry", "supervisor', 'admin"],
    ["delete_attendance_entry", "supervisor', 'admin"],
    ["confirm_attendance_shift", "supervisor', 'admin"],
    ["reopen_attendance_shift", "supervisor', 'admin"],
    ["add_worker", "supervisor', 'admin"],
    ["update_worker", "admin"],
  ];

  for (const [name, roles] of rpcs) {
    assert.match(
      migration,
      new RegExp(`create or replace function public\\.${name}`, "i"),
      `${name} missing`
    );
    assert.match(
      migration,
      new RegExp(
        `function public\\.${name}[\\s\\S]*?me := public\\.current_profile\\(\\)`,
        "i"
      ),
      `${name} must open with current_profile`
    );
    assert.match(
      migration,
      new RegExp(`function public\\.${name}[\\s\\S]*?${roles}`, "i"),
      `${name} role allowlist`
    );
    assert.match(
      migration,
      new RegExp(
        `revoke all on function public\\.${name}[\\s\\S]*?from public, anon`,
        "i"
      ),
      `${name} revoke`
    );
    assert.match(
      migration,
      new RegExp(
        `grant execute on function public\\.${name}[\\s\\S]*?to authenticated`,
        "i"
      ),
      `${name} grant`
    );
  }

  // update_worker is admin-only — supervisor must not be in its allowlist block.
  assert.match(
    migration,
    /function public\.update_worker[\s\S]*?if me\.role <> 'admin' then/i
  );

  // Supervisor company always from profile, never request param.
  assert.match(
    migration,
    /Never accept a company argument from a Supervisor/i
  );
  assert.match(migration, /company_clean := me\.company/i);

  // Domain errors.
  for (const code of [
    "NOT_AUTHORISED",
    "NOT_FOUND",
    "LOCKED",
    "LENT_TO_SAME_COMPANY",
  ]) {
    assert.match(
      migration,
      new RegExp(`raise exception '${code}' using errcode = 'P0001'`, "i"),
      code
    );
  }

  // Post-lock admin audit only.
  assert.match(migration, /if locked and me\.role = 'admin' then/i);
  assert.match(migration, /'entry_created'/i);
  assert.match(migration, /'entry_updated'/i);
  assert.match(migration, /'entry_deleted'/i);
  assert.match(migration, /'shift_confirmed'/i);
  assert.match(migration, /'shift_reopened'/i);

  // LOCKED guard present on write RPCs.
  assert.match(migration, /raise exception 'LOCKED' using errcode = 'P0001'/i);

  // A confirmed shift is read-only for Supervisors until they explicitly reopen it.
  assert.match(
    migration,
    /function public\.upsert_attendance_entry[\s\S]*?if me\.role = 'supervisor'[\s\S]*?day\.confirmed_at is not null[\s\S]*?raise exception 'CONFIRMED' using errcode = 'P0001'/i
  );
  assert.match(
    migration,
    /function public\.delete_attendance_entry[\s\S]*?if me\.role = 'supervisor'[\s\S]*?day\.confirmed_at is not null[\s\S]*?raise exception 'CONFIRMED' using errcode = 'P0001'/i
  );

  // Supervisors can only record against the active roster exposed to them.
  const raceMigration = sql["20260804130100_attendance_day_race.sql"];
  assert.match(
    raceMigration,
    /function public\.upsert_attendance_entry[\s\S]*?if me\.role = 'supervisor'[\s\S]*?not worker\.active[\s\S]*?raise exception 'NOT_AUTHORISED' using errcode = 'P0001'/i
  );

  // All security definer.
  assert.match(
    migration,
    /function public\.upsert_attendance_entry[\s\S]*?security definer/i
  );
});

test("attendance first writes retry after a concurrent day insert", () => {
  const migration = sql["20260804130100_attendance_day_race.sql"];
  assert.ok(migration, "attendance day race migration missing");
  for (const name of ["upsert_attendance_entry", "confirm_attendance_shift"]) {
    assert.match(
      migration,
      new RegExp(
        `function public\\.${name}[\\s\\S]*?on conflict \\(company, work_date, shift\\) do nothing[\\s\\S]*?select \\* into day`,
        "i"
      ),
      `${name} must retry after a concurrent day insert`
    );
  }
});

test("admin provisioning surface is removed; roles stay in Supabase", () => {
  assert.equal(
    existsSync(join(process.cwd(), "src", "app", "admin", "page.tsx")),
    false
  );
  assert.equal(
    existsSync(
      join(process.cwd(), "src", "app", "api", "admin", "users", "route.ts")
    ),
    false
  );
  assert.equal(
    existsSync(join(process.cwd(), "src", "lib", "admin-users.ts")),
    false
  );

  // A service-role key must not be needed by the application source.
  const walk = (dir) => {
    const out = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(...walk(p));
      else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(p);
    }
    return out;
  };
  const srcRoot = join(process.cwd(), "src");
  const hits = walk(srcRoot).filter((p) =>
    readFileSync(p, "utf8").includes("SUPABASE_SERVICE_ROLE_KEY")
  );
  assert.deepEqual(hits, [], `service role key leaked to: ${hits.join(", ")}`);

  // Never in client components as NEXT_PUBLIC
  const allSrc = walk(srcRoot)
    .map((p) => readFileSync(p, "utf8"))
    .join("\n");
  assert.doesNotMatch(allSrc, /NEXT_PUBLIC_.*SERVICE_ROLE/);
});

test("payment and to-do RPCs still refuse unknown roles (supervisor default deny)", () => {
  const paymentAllowlists = [
    ["015_edit_unpaid_payment.sql", /me\.role not in \('employee', 'director', 'accounts', 'admin'\)/i],
    ["20260731120000_delete_payment.sql", /me\.role not in \('director', 'admin'\)/i],
  ];
  for (const [file, re] of paymentAllowlists) {
    const body = sql[file];
    assert.ok(body, `${file} missing`);
    assert.match(body, re, file);
    assert.doesNotMatch(body, /'supervisor'/i, `${file} must not list supervisor`);
  }
});
