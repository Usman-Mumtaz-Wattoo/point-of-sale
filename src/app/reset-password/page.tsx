"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, type AuthActionResult } from "@/app/auth/actions";

export default function RequestPasswordResetPage() {
  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    requestPasswordResetAction,
    null
  );

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-slate-900 text-slate-100">
      <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-xl p-8 shadow-xl space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">Reset Password</h1>
          <p className="text-sm text-slate-400">
            Enter your email to receive recovery instructions
          </p>
        </div>

        {state?.error && (
          <div className="p-3 text-sm rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
            {state.error}
          </div>
        )}

        {state?.success && state.message && (
          <div className="p-3 text-sm rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            {state.message}
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="email"
              className="block text-xs font-medium text-slate-300"
            >
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Sending instructions..." : "Send Reset Email"}
          </button>
        </form>

        <div className="text-center text-xs text-slate-400">
          Remembered your password?{" "}
          <Link href="/login" className="text-emerald-400 hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
