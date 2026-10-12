"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updatePasswordAction, type AuthActionResult } from "@/app/auth/actions";
import { ThemeToggle } from "@/components/theme-provider";

export default function UpdatePasswordPage() {
  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    updatePasswordAction,
    null
  );

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 transition-colors relative">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-8 shadow-xl space-y-6">
        <div className="space-y-1.5 text-center">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto text-xl border border-indigo-200 dark:border-indigo-500/20 mb-2">
            🔐
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Set New Password</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Enter your new secure password
          </p>
        </div>

        {state?.error && (
          <div className="p-3.5 text-xs rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-200 font-medium">
            {state.error}
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
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
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
              placeholder="•••••••• (min 6 characters)"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="passwordConfirmation"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
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
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isPending && (
              <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            )}
            <span>{isPending ? "Updating password..." : "Save Password"}</span>
          </button>
        </form>

        <div className="text-center text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Link href="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold">
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
