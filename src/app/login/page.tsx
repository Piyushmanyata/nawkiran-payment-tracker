"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { userMessageFromError } from "@/lib/errors";
import { errorBoxClass, fieldClass, labelClass } from "@/lib/ui";
import { LoadingButton } from "@/components/LoadingButton";

export default function LoginPage() {
  const { signIn, configured } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      router.replace("/open");
    } catch (err) {
      setError(userMessageFromError(err));
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-sm">
          N
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Nawkiran Payments
        </h1>
        <p className="mt-1 text-sm text-slate-600">Sign in to continue</p>
      </div>

      {!configured ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Supabase is not configured yet.</p>
          <p className="mt-2">
            Copy <code className="rounded bg-white px-1">.env.local.example</code>{" "}
            to <code className="rounded bg-white px-1">.env.local</code> and set:
          </p>
          <ul className="mt-2 list-disc pl-5">
            <li>NEXT_PUBLIC_SUPABASE_URL</li>
            <li>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</li>
          </ul>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className={labelClass}>Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
          />
        </label>

        {error ? <p className={errorBoxClass}>{error}</p> : null}

        <LoadingButton
          type="submit"
          loading={loading}
          loadingText="Signing in..."
          disabled={!configured}
        >
          Login
        </LoadingButton>
      </form>
    </div>
  );
}
