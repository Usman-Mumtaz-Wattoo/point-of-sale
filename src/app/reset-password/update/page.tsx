"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updatePasswordAction, type AuthActionResult } from "@/app/auth/actions";

export default function UpdatePasswordPage() {
  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    updatePasswordAction,
    null
  );

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-slate-900 text-slate-100">
      <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-xl p-8 shadow-xl space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">Set New Password</h1>
          <p className="text-sm text-slate-400">
            Enter your new secure password
          </p>
        </div>

        {state?.error && (
          <div className="p-3 text-sm rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
            {state.error}
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="password"
              className="block text-xs font-medium text-slate-300"
            >
              New Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="•••••••• (min 6 characters)"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="passwordConfirmation"
              className="block text-xs font-medium text-slate-300"
            >
              Confirm New Password
            </label>
            <input
              id="passwordConfirmation"
              name="passwordConfirmation"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Updating password..." : "Save Password"}
          </button>
        </form>

        <div className="text-center text-xs text-slate-400">
          <Link href="/login" className="text-emerald-400 hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
