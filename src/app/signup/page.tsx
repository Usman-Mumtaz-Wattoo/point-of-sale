"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction, type AuthActionResult } from "@/app/auth/actions";

export default function SignupPage() {
  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    signupAction,
    null
  );

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-slate-900 text-slate-100">
      <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-xl p-8 shadow-xl space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">Create Account</h1>
          <p className="text-sm text-slate-400">
            Sign up to get started with your account
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
              htmlFor="name"
              className="block text-xs font-medium text-slate-300"
            >
              Full Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              autoComplete="name"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Jane Doe"
            />
          </div>

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

          <div className="space-y-1">
            <label
              htmlFor="password"
              className="block text-xs font-medium text-slate-300"
            >
              Password
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
              Confirm Password
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
            {isPending ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        <div className="text-center text-xs text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="text-emerald-400 hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
