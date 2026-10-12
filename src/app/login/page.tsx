"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { loginAction, type AuthActionResult } from "@/app/auth/actions";
import { AuthLayout } from "@/components/auth-layout";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    loginAction,
    null
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <AuthLayout
      title="Login"
      footer={
        <p className="text-white/80">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-white font-semibold hover:underline drop-shadow-xs"
          >
            Sign up
          </Link>
        </p>
      }
    >
      {state?.error && (
        <div className="p-3 text-xs rounded-lg bg-rose-500/25 border border-rose-300/40 text-white font-medium backdrop-blur-md">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-3.5">
        {/* Email Field */}
        <div className="space-y-1">
          <label
            htmlFor="email"
            className="block text-xs font-semibold text-white/95 tracking-wide"
          >
            Email
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

        {/* Password Field */}
        <div className="space-y-1">
          <label
            htmlFor="password"
            className="block text-xs font-semibold text-white/95 tracking-wide"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              className="w-full pl-3.5 pr-10 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 rounded-lg text-sm font-medium shadow-xs focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all border-0"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5"
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="pt-0.5">
            <Link
              href="/reset-password"
              className="text-[11px] text-white/80 hover:text-white font-medium hover:underline transition-colors inline-block"
            >
              Forgot Password?
            </Link>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isPending}
          className="w-full mt-2 py-2.5 px-4 rounded-lg bg-[#0c2461] hover:bg-[#081a47] active:scale-[0.99] text-white font-bold text-sm transition-all shadow-md disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
        >
          {isPending && (
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          <span>{isPending ? "Signing in..." : "Sign in"}</span>
        </button>
      </form>
    </AuthLayout>
  );
}
