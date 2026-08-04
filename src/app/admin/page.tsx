"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { ErrorBanner } from "@/components/ErrorBanner";
import { LoadingButton } from "@/components/LoadingButton";
import { PageLoading } from "@/components/PageLoading";
import {
  fetchWorkersAll,
  updateWorkerViaRpc,
} from "@/lib/attendance-data";
import { userMessageFromError } from "@/lib/errors";
import { fieldClass, labelClass, successBoxClass } from "@/lib/ui";
import type { Company, Profile, Worker } from "@/types/database";

type StaffRow = Pick<
  Profile,
  "id" | "full_name" | "role" | "company" | "active" | "created_at"
>;

export default function AdminPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"employee" | "supervisor">("employee");
  const [company, setCompany] = useState<Company>("NKPL");

  const allowed = profile?.role === "admin";

  useEffect(() => {
    if (authLoading) return;
    if (!profile) return;
    if (profile.role !== "admin") {
      router.replace("/open");
    }
  }, [authLoading, profile, router]);

  const load = useCallback(async () => {
    try {
      const [usersRes, roster] = await Promise.all([
        fetch("/api/admin/users"),
        fetchWorkersAll(),
      ]);
      if (!usersRes.ok) {
        const body = (await usersRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || "Failed to load staff");
      }
      const body = (await usersRes.json()) as { profiles: StaffRow[] };
      setStaff(body.profiles);
      setWorkers(roster);
      setError(null);
    } catch (err) {
      setError(userMessageFromError(err));
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    const kick = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(kick);
  }, [allowed, load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setTempPassword(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          fullName,
          role,
          company: role === "supervisor" ? company : null,
        }),
      });
      const body = (await res.json()) as {
        temporaryPassword?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || "Create failed");
      setTempPassword(body.temporaryPassword ?? null);
      setEmail("");
      setFullName("");
      await load();
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onToggleActive(userId: string, active: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, active }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Update failed");
      }
      await load();
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDeactivateWorker(worker: Worker) {
    setBusy(true);
    setError(null);
    try {
      await updateWorkerViaRpc({
        workerId: worker.id,
        active: !worker.active,
      });
      await load();
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRenameWorker(worker: Worker) {
    const name = window.prompt("Full name", worker.full_name);
    if (name == null || !name.trim()) return;
    const desig = window.prompt(
      "Designation (blank to clear)",
      worker.designation ?? ""
    );
    setBusy(true);
    setError(null);
    try {
      await updateWorkerViaRpc({
        workerId: worker.id,
        fullName: name.trim(),
        designation: desig === null ? undefined : desig.trim() || null,
      });
      await load();
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || !profile) return <PageLoading />;
  if (!allowed) {
    return (
      <div className="text-sm text-slate-600">Redirecting…</div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">Admin</h1>
        <p className="text-sm font-medium text-slate-500">
          Staff logins and worker roster
        </p>
      </div>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {tempPassword ? (
        <div className={successBoxClass}>
          <p className="font-bold">Temporary password (copy now — shown once)</p>
          <p className="mt-1 font-mono text-base tracking-wide">{tempPassword}</p>
          <p className="mt-2 text-xs">
            Hand it over in person. The user should change it after first sign-in.
          </p>
        </div>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-extrabold text-slate-900">
          Create staff login
        </h2>
        <form onSubmit={(e) => void onCreate(e)} className="space-y-3">
          <label className="block">
            <span className={labelClass}>Full name</span>
            <input
              className={fieldClass}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className={labelClass}>Email</span>
            <input
              type="email"
              className={fieldClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <div className="flex gap-2">
            {(["employee", "supervisor"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`min-h-11 flex-1 rounded-xl border text-sm font-bold capitalize ${
                  role === r
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 text-slate-700"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          {role === "supervisor" ? (
            <div className="flex gap-2">
              {(["NKPL", "APTUS"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCompany(c)}
                  className={`min-h-11 flex-1 rounded-xl border text-sm font-bold ${
                    company === c
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 text-slate-700"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : null}
          <LoadingButton type="submit" loading={busy}>
            Create login
          </LoadingButton>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-extrabold text-slate-900">Staff</h2>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {staff.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-bold text-slate-900">{s.full_name}</p>
                <p className="text-xs font-medium text-slate-500">
                  {s.role}
                  {s.company ? ` · ${s.company}` : ""}
                  {!s.active ? " · inactive" : ""}
                </p>
              </div>
              {s.role === "employee" || s.role === "supervisor" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onToggleActive(s.id, !s.active)}
                  className="shrink-0 text-xs font-bold text-slate-700 underline"
                >
                  {s.active ? "Deactivate" : "Reactivate"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-extrabold text-slate-900">
          Worker roster
        </h2>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {workers.map((w) => (
            <li
              key={w.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-bold text-slate-900">
                  {w.full_name}
                  {!w.active ? (
                    <span className="ml-2 text-xs font-semibold text-slate-400">
                      inactive
                    </span>
                  ) : null}
                </p>
                <p className="text-xs font-medium text-slate-500">
                  {w.company}
                  {w.designation ? ` · ${w.designation}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRenameWorker(w)}
                  className="text-xs font-bold text-blue-600"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDeactivateWorker(w)}
                  className="text-xs font-bold text-slate-700 underline"
                >
                  {w.active ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
