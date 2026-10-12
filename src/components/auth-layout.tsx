"use client";

import React from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-provider";
import { Store } from "lucide-react";

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  showSocials?: boolean;
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  showSocials = true,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-3 sm:p-6 md:p-8 bg-[#729fe8] dark:bg-[#070b16] transition-colors relative overflow-hidden select-none">
      {/* Ambient background glow for outer viewport */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-blue-300/30 dark:bg-blue-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-indigo-300/30 dark:bg-indigo-600/10 blur-3xl" />
      </div>

      {/* Floating Theme Switcher */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-30">
        <div className="backdrop-blur-md bg-white/20 dark:bg-slate-900/60 p-1.5 rounded-2xl border border-white/30 dark:border-slate-800 shadow-lg text-white">
          <ThemeToggle />
        </div>
      </div>

      {/* Main Display Canvas matching the reference image */}
      <div className="relative w-full max-w-5xl rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden bg-gradient-to-br from-[#1366e2] via-[#0d4ec2] to-[#073289] dark:from-[#0a1f4d] dark:via-[#071638] dark:to-[#030b1c] border border-white/20 dark:border-white/10 min-h-[580px] sm:min-h-[640px] md:min-h-[680px] flex items-center justify-center p-4 sm:p-8 my-auto">
        {/* ========================================================= */}
        {/* Decorative 3D Fluid Ribbons & Abstract Shapes Layer        */}
        {/* ========================================================= */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
          {/* Ambient Lighting Gradients */}
          <div className="absolute top-1/4 right-1/4 w-80 h-80 rounded-full bg-sky-400/20 blur-3xl" />
          <div className="absolute bottom-1/4 left-1/4 w-80 h-80 rounded-full bg-blue-600/30 blur-3xl" />

          {/* Top-Left: Stepped 3D Pill Noodle */}
          <svg
            className="absolute top-12 left-6 sm:top-20 sm:left-12 w-28 h-28 sm:w-36 sm:h-36 opacity-90 drop-shadow-[0_12px_20px_rgba(0,0,0,0.35)]"
            viewBox="0 0 140 140"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="noodleGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#bae6fd" />
                <stop offset="40%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#0284c7" />
              </linearGradient>
              <filter id="noodleBevel1" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="3" dy="5" stdDeviation="4" floodColor="#03306d" floodOpacity="0.4" />
              </filter>
            </defs>
            {/* Upper stepped pill */}
            <path
              d="M 35 45 C 35 34, 44 25, 55 25 L 85 25 C 96 25, 105 34, 105 45 C 105 56, 96 65, 85 65 L 75 65 C 64 65, 55 74, 55 85 C 55 96, 46 105, 35 105 C 24 105, 15 96, 15 85 C 15 74, 24 65, 35 65 L 45 65 C 56 65, 65 56, 65 45 Z"
              fill="url(#noodleGrad1)"
              filter="url(#noodleBevel1)"
            />
            {/* Small floating pill accent */}
            <path
              d="M 25 105 C 25 99, 30 94, 36 94 L 46 94 C 52 94, 57 99, 57 105 C 57 111, 52 116, 46 116 L 36 116 C 30 116, 25 111, 25 105 Z"
              fill="url(#noodleGrad1)"
              filter="url(#noodleBevel1)"
              transform="translate(-5, 10) rotate(-25 41 105)"
            />
          </svg>

          {/* Right-Side: Large 3D Spiral Ribbons */}
          <svg
            className="absolute -right-8 sm:-right-4 top-10 sm:top-14 w-64 h-96 sm:w-80 sm:h-[460px] opacity-80 pointer-events-none drop-shadow-[0_20px_35px_rgba(0,0,0,0.45)]"
            viewBox="0 0 260 400"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="spiralRibbonGrad" x1="20%" y1="0%" x2="80%" y2="100%">
                <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.4" />
                <stop offset="30%" stopColor="#0284c7" />
                <stop offset="60%" stopColor="#0369a1" />
                <stop offset="100%" stopColor="#0f172a" stopOpacity="0.7" />
              </linearGradient>
              <filter id="spiralShadow">
                <feDropShadow dx="-6" dy="12" stdDeviation="10" floodColor="#031a47" floodOpacity="0.6" />
              </filter>
            </defs>
            {/* Primary looping curve */}
            <path
              d="M 170 30 C 230 40, 240 100, 210 140 C 180 180, 160 170, 150 200 C 140 230, 150 260, 180 280 C 210 300, 220 350, 180 390"
              stroke="url(#spiralRibbonGrad)"
              strokeWidth="38"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#spiralShadow)"
            />
            {/* Secondary deep curve */}
            <path
              d="M 120 70 C 160 80, 170 120, 150 150 C 130 180, 110 200, 115 240 C 120 280, 150 310, 140 360"
              stroke="#0f3b7d"
              strokeWidth="28"
              strokeLinecap="round"
              opacity="0.5"
            />
          </svg>

          {/* Bottom-Left: Horseshoe 3D Ring Noodle */}
          <svg
            className="absolute -bottom-8 left-10 sm:left-24 w-44 h-44 sm:w-56 sm:h-56 opacity-85 pointer-events-none drop-shadow-[0_15px_30px_rgba(0,0,0,0.4)]"
            viewBox="0 0 180 180"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#7dd3fc" />
                <stop offset="50%" stopColor="#0284c7" />
                <stop offset="100%" stopColor="#034594" />
              </linearGradient>
            </defs>
            <path
              d="M 50 140 C 30 100, 45 50, 90 40 C 135 30, 165 70, 155 115 C 150 140, 130 155, 110 150"
              stroke="url(#ringGrad)"
              strokeWidth="32"
              strokeLinecap="round"
            />
          </svg>

          {/* Bottom-Right: Soft Wave Ripples */}
          <svg
            className="absolute bottom-16 right-16 sm:bottom-20 sm:right-28 w-28 h-16 sm:w-36 sm:h-20 opacity-80 pointer-events-none drop-shadow-[0_8px_16px_rgba(0,0,0,0.3)]"
            viewBox="0 0 120 60"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#93c5fd" />
                <stop offset="50%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#60a5fa" />
              </linearGradient>
            </defs>
            {/* Wave 1 */}
            <path
              d="M 10 20 Q 25 10, 40 20 T 70 20 T 100 20"
              stroke="url(#waveGrad)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            {/* Wave 2 */}
            <path
              d="M 25 42 Q 40 32, 55 42 T 85 42 T 110 42"
              stroke="url(#waveGrad)"
              strokeWidth="12"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* ========================================================= */}
        {/* Central Frosted Glassmorphism Card                         */}
        {/* ========================================================= */}
        <div className="relative z-10 w-full max-w-[390px] sm:max-w-[420px] backdrop-blur-2xl bg-white/[0.14] dark:bg-slate-900/[0.45] border border-white/35 dark:border-white/15 rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] text-white flex flex-col">
          {/* Card Branding & Header */}
          <div className="mb-5 sm:mb-6">
            <div className="flex items-center gap-2 mb-1.5 text-white/85">
              <div className="w-6 h-6 rounded-lg bg-white/20 dark:bg-white/15 flex items-center justify-center border border-white/30 text-white">
                <Store className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-semibold tracking-wide">POS Asistant</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white drop-shadow-xs">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs text-white/80 mt-1 font-normal leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>

          {/* Form Content / Children */}
          <div className="space-y-4">{children}</div>

          {/* Social Logins - Google Only */}
          {showSocials && (
            <div className="mt-5 pt-1 text-center space-y-3">
              <div className="text-[11px] sm:text-xs text-white/80 font-medium">
                or continue with
              </div>
              <div className="flex justify-center">
                <button
                  type="button"
                  title="Sign in with Google"
                  className="w-full py-2.5 px-4 rounded-lg bg-white hover:bg-slate-50 text-slate-800 shadow-sm flex items-center justify-center gap-2.5 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer font-semibold text-xs"
                  onClick={() => {
                    alert("Google OAuth is configured in Supabase Auth Settings. Use your registered email credentials below.");
                  }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Google</span>
                </button>
              </div>
            </div>
          )}

          {/* Footer Navigation Link */}
          {footer && (
            <div className="mt-4 pt-3 text-center text-xs text-white/90 border-t border-white/20">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
