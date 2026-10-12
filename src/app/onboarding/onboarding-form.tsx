"use client";

import { useActionState } from "react";
import Link from "next/link";
import { onboardingAction, type OnboardingActionResult } from "./actions";

export function OnboardingForm() {
  const [state, formAction, isPending] = useActionState<OnboardingActionResult | null, FormData>(
    onboardingAction,
    null
  );

  const getField = (name: string, fallback = "") => {
    return state?.fields?.[name] ?? fallback;
  };

  return (
    <form action={formAction} className="space-y-8">
      {state?.error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          {state.error}
        </div>
      )}

      {/* SECTION 1: BUSINESS / ORGANIZATION INFORMATION */}
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">1. Business Profile</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Define your company, brand, or shop identity.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Business / Store Name <span className="text-indigo-600 dark:text-indigo-400">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={getField("name")}
              placeholder="e.g. Apex Retailers, Bilal Grocers"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="legalName" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Legal / Registered Name
            </label>
            <input
              id="legalName"
              name="legalName"
              type="text"
              defaultValue={getField("legalName")}
              placeholder="Optional registered entity name"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Business Contact Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={getField("email")}
              placeholder="contact@business.com"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="phone" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Business Phone
            </label>
            <input
              id="phone"
              name="phone"
              type="text"
              defaultValue={getField("phone")}
              placeholder="+92 300 1234567"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="city" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              City
            </label>
            <input
              id="city"
              name="city"
              type="text"
              defaultValue={getField("city")}
              placeholder="e.g. Lahore, Karachi, Islamabad"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="country" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Country
            </label>
            <input
              id="country"
              name="country"
              type="text"
              defaultValue={getField("country", "Pakistan")}
              placeholder="Pakistan"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="address" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Street Address
            </label>
            <input
              id="address"
              name="address"
              type="text"
              defaultValue={getField("address")}
              placeholder="Commercial area, street, plaza"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: PRIMARY BRANCH */}
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">2. First Branch & Counter</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Set up your primary outlet or store location.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="branchName" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Branch Name <span className="text-indigo-600 dark:text-indigo-400">*</span>
            </label>
            <input
              id="branchName"
              name="branchName"
              type="text"
              required
              defaultValue={getField("branchName", "Main Branch")}
              placeholder="e.g. Main Branch, Gulberg Outlet"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="branchCode" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Branch Code <span className="text-indigo-600 dark:text-indigo-400">*</span>
            </label>
            <input
              id="branchCode"
              name="branchCode"
              type="text"
              required
              defaultValue={getField("branchCode", "MAIN")}
              placeholder="e.g. MAIN, HQ, BR-01"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white font-mono uppercase placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* SECTION 3: REGIONAL & INVOICING PREFERENCES */}
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">3. Defaults & Regional Settings</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Configure currency, timezone, and transaction prefixes.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="currency" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Currency Code
            </label>
            <input
              id="currency"
              name="currency"
              type="text"
              defaultValue={getField("currency", "PKR")}
              maxLength={3}
              placeholder="PKR"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white font-mono uppercase placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="timezone" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Timezone
            </label>
            <input
              id="timezone"
              name="timezone"
              type="text"
              defaultValue={getField("timezone", "Asia/Karachi")}
              placeholder="Asia/Karachi"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="dateFormat" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Date Format
            </label>
            <select
              id="dateFormat"
              name="dateFormat"
              defaultValue={getField("dateFormat", "YYYY-MM-DD")}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            >
              <option value="YYYY-MM-DD">YYYY-MM-DD (2026-09-23)</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY (23/09/2026)</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY (09/23/2026)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invoicePrefix" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Invoice Prefix
            </label>
            <input
              id="invoicePrefix"
              name="invoicePrefix"
              type="text"
              defaultValue={getField("invoicePrefix", "INV-")}
              placeholder="INV-"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white font-mono placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="receiptPrefix" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Receipt Prefix
            </label>
            <input
              id="receiptPrefix"
              name="receiptPrefix"
              type="text"
              defaultValue={getField("receiptPrefix", "REC-")}
              placeholder="REC-"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white font-mono placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="defaultTaxRate" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Default Tax Rate (%)
            </label>
            <input
              id="defaultTaxRate"
              name="defaultTaxRate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              defaultValue={getField("defaultTaxRate", "0.00")}
              placeholder="0.00"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* SUBMIT ACTIONS */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200/80 dark:border-slate-800">
        <Link
          href="/dashboard"
          className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          &larr; Back to Dashboard
        </Link>

        <button
          type="submit"
          disabled={isPending}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isPending && (
            <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          )}
          <span>{isPending ? "Creating Business..." : "Complete Setup & Launch"}</span>
        </button>
      </div>
    </form>
  );
}
