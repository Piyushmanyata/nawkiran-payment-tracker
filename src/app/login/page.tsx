"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { userMessageFromError } from "@/lib/errors";
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
      <h1 className="text-2xl font-bold text-slate-900">Nawkiran Payments</h1>
      <p className="mt-1 text-sm text-slate-600">Sign in to continue</p>

      {!configured ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
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

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">
            Email
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">
            Password
          </span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </label>

        {error ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}

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
