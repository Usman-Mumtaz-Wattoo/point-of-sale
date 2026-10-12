"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, type AuthActionResult } from "@/app/auth/actions";
import { AuthLayout } from "@/components/auth-layout";

export default function RequestPasswordResetPage() {
  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    requestPasswordResetAction,
    null
  );

  return (
    <AuthLayout
      title="Reset"
      subtitle="Enter your email to receive recovery instructions"
      showSocials={false}
      footer={
        <p className="text-white/80">
          Remembered your password?{" "}
          <Link
            href="/login"
            className="text-white font-semibold hover:underline drop-shadow-xs"
          >
            Back to sign in
          </Link>
        </p>
      }
    >
      {state?.error && (
        <div className="p-3 text-xs rounded-lg bg-rose-500/25 border border-rose-300/40 text-white font-medium backdrop-blur-md">
          {state.error}
        </div>
      )}

      {state?.success && state.message && (
        <div className="p-3 text-xs rounded-lg bg-emerald-500/25 border border-emerald-300/40 text-white font-medium backdrop-blur-md">
          {state.message}
        </div>
      )}

      <form action={formAction} className="space-y-3.5">
        <div className="space-y-1">
          <label
            htmlFor="email"
            className="block text-xs font-semibold text-white/95 tracking-wide"
          >
            Email Address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 rounded-lg text-sm font-medium shadow-xs focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all border-0"
            placeholder="username@gmail.com"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full mt-2 py-2.5 px-4 rounded-lg bg-[#0c2461] hover:bg-[#081a47] active:scale-[0.99] text-white font-bold text-sm transition-all shadow-md disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
        >
          {isPending && (
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          <span>{isPending ? "Sending instructions..." : "Send Reset Email"}</span>
        </button>
      </form>
    </AuthLayout>
  );
}
