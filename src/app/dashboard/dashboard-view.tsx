"use client";

import React, { useState, useTransition, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Percent,
  Receipt,
  RotateCcw,
  PackageX,
  AlertTriangle,
  Boxes,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Store,
  ChevronDown,
  ArrowUpRight,
  Users,
  Layers,
  Activity,
  Award,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getDashboardMetricsAction } from "./actions";
import { KpiCard } from "./kpi-card";
import type {
  DashboardMetricsDTO,
  DashboardDatePreset,
  SelectedBranchInfo,
  DashboardStockAlertItem,
  DashboardTopProductItem,
  DashboardActivityItem,
  DashboardBranchSummary,
} from "./types";
import { SYSTEM_ROLES } from "@/lib/roles";

interface DashboardViewProps {
  initialData: DashboardMetricsDTO;
  userEmail: string;
  userName: string;
}

/**
 * Pure string/integer currency formatter that strictly avoids JS floating-point math.
 */
export function formatCurrencyAmount(
  amount: string | null | undefined,
  currency: string = "USD"
): string {
  if (amount === null || amount === undefined) return "—";
  const str = String(amount).trim();
  if (!str) return "—";

  const isNegative = str.startsWith("-");
  const rawAbs = isNegative ? str.slice(1) : str;
  const parts = rawAbs.split(".");
  const intDigits = parts[0] || "0";
  const decDigits = (parts[1] || "00").padEnd(2, "0").slice(0, 2);

  const formattedInt = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formattedVal = `${isNegative ? "-" : ""}${formattedInt}.${decDigits}`;

  try {
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    });
    const partsArray = formatter.formatToParts(0);
    const currPart = partsArray.find((p) => p.type === "currency");
    const symbol = currPart ? currPart.value : currency;
    return `${symbol} ${formattedVal}`;
  } catch {
    return `${currency} ${formattedVal}`;
  }
}

/**
 * Formats ISO date range strings into a clean human-readable reporting period label.
 */
function formatPeriodDisplay(
  dateRange: DashboardMetricsDTO["dateRange"],
  timeZone: string
): string {
  if (dateRange.preset === "all" || (!dateRange.startDate && !dateRange.endDate)) {
    return "All Recorded History";
  }

  if (!dateRange.startDate || !dateRange.endDate) {
    return dateRange.preset;
  }

  try {
    const sDate = new Date(dateRange.startDate);
    const eDate = new Date(dateRange.endDate);

    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const sStr = formatter.format(sDate);
    const eStr = formatter.format(eDate);

    if (sStr === eStr) {
      return sStr;
    }
    return `${sStr} – ${eStr}`;
  } catch {
    return `${dateRange.startDate.slice(0, 10)} to ${dateRange.endDate.slice(0, 10)}`;
  }
}

/**
 * Formats timestamp strings for activity logs.
 */
function formatActivityTime(isoString: string, timeZone: string): string {
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return isoString.slice(0, 16).replace("T", " ");
  }
}

export function DashboardView({
  initialData,
  userEmail,
  userName,
}: DashboardViewProps) {
  const [data, setData] = useState<DashboardMetricsDTO>(initialData);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    initialData.selectedBranch?.id || ""
  );
  const [selectedPreset, setSelectedPreset] = useState<DashboardDatePreset>(
    initialData.dateRange.preset
  );
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [customFormOpen, setCustomFormOpen] = useState<boolean>(
    initialData.dateRange.preset === "custom"
  );
  const [customError, setCustomError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const requestSeqRef = useRef<number>(0);

  const isInventoryManager = data.userRole === SYSTEM_ROLES.INVENTORY_MANAGER;
  const isOwner = data.userRole === SYSTEM_ROLES.OWNER;
  const isAccountant = data.userRole === SYSTEM_ROLES.ACCOUNTANT;
  const canSelectAllBranches = isOwner || isAccountant;
  const hasMultipleBranches = data.accessibleBranches.length > 1;

  const fetchMetrics = useCallback(
    (branchId: string, preset: DashboardDatePreset, start?: string, end?: string) => {
      setErrorMessage(null);
      const currentSeq = ++requestSeqRef.current;

      startTransition(async () => {
        try {
          const res = await getDashboardMetricsAction(
            {
              branchId: branchId ? branchId : undefined,
              datePreset: preset,
              startDate: preset === "custom" ? start : undefined,
              endDate: preset === "custom" ? end : undefined,
            },
            data.organizationId
          );

          if (currentSeq !== requestSeqRef.current) {
            return;
          }

          if (res.success && res.data) {
            setData(res.data);
            if (preset !== "custom") {
              setCustomFormOpen(false);
              setCustomError(null);
            }
          } else {
            setErrorMessage(res.error || "Failed to load dashboard metrics.");
          }
        } catch {
          if (currentSeq === requestSeqRef.current) {
            setErrorMessage("An unexpected network error occurred while updating metrics.");
          }
        }
      });
    },
    [data.organizationId]
  );

  const handlePresetChange = (preset: DashboardDatePreset) => {
    setSelectedPreset(preset);
    if (preset === "custom") {
      setCustomFormOpen(true);
      return;
    }
    setCustomFormOpen(false);
    setCustomError(null);
    fetchMetrics(selectedBranchId, preset);
  };

  const handleCustomApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStart.trim() || !customEnd.trim()) {
      setCustomError("Both start and end dates are required.");
      return;
    }
    if (customStart > customEnd) {
      setCustomError("Start date cannot be after end date.");
      return;
    }
    setCustomError(null);
    fetchMetrics(selectedBranchId, "custom", customStart, customEnd);
  };

  const handleBranchChange = (branchId: string) => {
    setSelectedBranchId(branchId);
    fetchMetrics(branchId, selectedPreset, customStart, customEnd);
  };

  const handleRefresh = () => {
    fetchMetrics(selectedBranchId, selectedPreset, customStart, customEnd);
  };

  const presets: { id: DashboardDatePreset; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "last7days", label: "Last 7 Days" },
    { id: "last30days", label: "Last 30 Days" },
    { id: "thisMonth", label: "This Month" },
    { id: "lastMonth", label: "Last Month" },
    { id: "all", label: "All History" },
    { id: "custom", label: "Custom Range" },
  ];

  const quickActions = [
    {
      title: "Point of Sale",
      description: "Launch cashier terminal",
      href: `/pos?org=${data.organizationId}`,
      icon: ShoppingBag,
      allowedRoles: ["OWNER", "MANAGER", "CASHIER"],
      color: "border-indigo-200 dark:border-indigo-500/20 hover:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400",
    },
    {
      title: "Sales Orders",
      description: "Inspect customer receipts",
      href: `/sales?org=${data.organizationId}`,
      icon: Receipt,
      allowedRoles: ["OWNER", "MANAGER", "CASHIER", "ACCOUNTANT"],
      color: "border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-700 dark:text-slate-300",
    },
    {
      title: "Customer Returns",
      description: "Process refunds & restocking",
      href: `/sales/returns?org=${data.organizationId}`,
      icon: RotateCcw,
      allowedRoles: ["OWNER", "MANAGER", "CASHIER", "ACCOUNTANT"],
      color: "border-amber-200 dark:border-amber-500/20 hover:border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400",
    },
    {
      title: "Stock Inventory",
      description: "Audit safety stock & movements",
      href: `/inventory?org=${data.organizationId}`,
      icon: Boxes,
      allowedRoles: ["OWNER", "MANAGER", "INVENTORY_MANAGER", "CASHIER", "ACCOUNTANT"],
      color: "border-emerald-200 dark:border-emerald-500/20 hover:border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Purchase Orders",
      description: "Create POs and receive stock",
      href: `/purchasing?org=${data.organizationId}`,
      icon: Receipt,
      allowedRoles: ["OWNER", "MANAGER", "INVENTORY_MANAGER", "ACCOUNTANT"],
      color: "border-sky-200 dark:border-sky-500/20 hover:border-sky-500 bg-sky-50/50 dark:bg-sky-950/20 text-sky-600 dark:text-sky-400",
    },
    {
      title: "Customers",
      description: "Buyer accounts and loyalty",
      href: `/customers?org=${data.organizationId}`,
      icon: Users,
      allowedRoles: ["OWNER", "MANAGER", "CASHIER", "ACCOUNTANT"],
      color: "border-purple-200 dark:border-purple-500/20 hover:border-purple-500 bg-purple-50/50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400",
    },
    {
      title: "Product Catalog",
      description: "Manage products & variants",
      href: `/catalog?org=${data.organizationId}`,
      icon: Layers,
      allowedRoles: ["OWNER", "MANAGER", "INVENTORY_MANAGER", "CASHIER", "ACCOUNTANT"],
      color: "border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-700 dark:text-slate-300",
    },
  ].filter((action) => action.allowedRoles.includes(data.userRole));

  return (
    <AppShell
      organizationId={data.organizationId}
      organizationName={data.organizationName}
      userRole={data.userRole}
      userName={userName}
      userEmail={userEmail}
      breadcrumbs={[
        { label: "Executive Dashboard" },
        { label: "Overview & Analytics" },
      ]}
    >
      <div className="space-y-6">
        {/* Role Segregation Notice for INVENTORY_MANAGER */}
        {isInventoryManager && (
          <div
            role="status"
            className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-200 text-xs sm:text-sm"
          >
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-500" />
            <div>
              <strong className="font-semibold text-amber-900 dark:text-amber-300">
                Inventory Manager Scoped Access:
              </strong>{" "}
              Financial metrics and sales figures are strictly restricted for your role. You have
              full visibility of authorized inventory thresholds, stock alerts, and inventory operations.
            </div>
          </div>
        )}

        {/* Error Alert Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-200 text-xs sm:text-sm"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={handleRefresh}
              className="px-3 py-1 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-colors shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Filter & Control Bar */}
        <section
          aria-label="Dashboard Filters"
          className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4"
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Date Presets Group */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-indigo-500" />
                Period:
              </span>
              {presets.map((p) => {
                const active = selectedPreset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handlePresetChange(p.id)}
                    disabled={isPending}
                    className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-all duration-150 border ${
                      active
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/80"
                    } ${isPending ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Branch Filter & Refresh */}
            <div className="flex items-center gap-3 flex-wrap">
              {(hasMultipleBranches || canSelectAllBranches) ? (
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="dashboard-branch-select"
                    className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1"
                  >
                    <Store className="w-3.5 h-3.5 text-slate-400" />
                    Branch:
                  </label>
                  <div className="relative">
                    <select
                      id="dashboard-branch-select"
                      value={selectedBranchId}
                      onChange={(e) => handleBranchChange(e.target.value)}
                      disabled={isPending}
                      className="appearance-none bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-xl px-3 py-1.5 pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                    >
                      {canSelectAllBranches && (
                        <option value="">All Branches (Consolidated)</option>
                      )}
                      {data.accessibleBranches.map((b: SelectedBranchInfo) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.code})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              ) : data.selectedBranch ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-xs text-slate-600 dark:text-slate-300">
                  <Store className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    Branch: <strong className="text-slate-900 dark:text-white font-semibold">{data.selectedBranch.name}</strong> ({data.selectedBranch.code})
                  </span>
                </div>
              ) : null}

              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={isPending}
                title="Refresh dashboard metrics"
                aria-label="Refresh metrics"
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isPending ? "animate-spin text-indigo-500" : ""}`}
                />
              </button>
            </div>
          </div>

          {/* Custom Date Range Picker */}
          {customFormOpen && (
            <form
              onSubmit={handleCustomApply}
              className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-3 text-xs"
            >
              <div className="flex items-center gap-2">
                <label htmlFor="custom-start-date" className="text-slate-500 dark:text-slate-400 font-medium">
                  Start:
                </label>
                <input
                  id="custom-start-date"
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="custom-end-date" className="text-slate-500 dark:text-slate-400 font-medium">
                  End:
                </label>
                <input
                  id="custom-end-date"
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors shadow-xs"
              >
                Apply Range
              </button>
              {customError && (
                <span className="text-rose-500 text-xs font-medium">{customError}</span>
              )}
            </form>
          )}

          {/* Context Strip */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-200/80 dark:border-slate-800/80 flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                Active Window:{" "}
                <strong className="text-slate-900 dark:text-white font-semibold">
                  {formatPeriodDisplay(data.dateRange, data.timezone)}
                </strong>
              </span>
              <span>•</span>
              <span>
                Timezone: <strong className="text-slate-700 dark:text-slate-300">{data.timezone}</strong>
              </span>
              <span>•</span>
              <span>
                Branch Scope:{" "}
                <strong className="text-slate-700 dark:text-slate-300">
                  {data.selectedBranch
                    ? `${data.selectedBranch.name} (${data.selectedBranch.code})`
                    : "All Permitted Branches"}
                </strong>
              </span>
            </div>

            {isPending && (
              <span className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                Updating metrics...
              </span>
            )}
          </div>
        </section>

        {/* Executive Overview & Analytical Chart Hero (Inspired by Screenshot 2) */}
        {!isInventoryManager && data.salesMetrics && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Analytical Chart Card */}
            <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Revenue Performance Overview
                    </span>
                    <div className="flex items-baseline gap-3">
                      <h3 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                        {formatCurrencyAmount(data.netSalesRevenue, data.currency)}
                      </h3>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <TrendingUp className="w-3.5 h-3.5" />
                        Net Revenue
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Orders</div>
                    <div className="text-lg font-bold text-slate-900 dark:text-white">
                      {data.salesMetrics.completedOrderCount}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatPeriodDisplay(data.dateRange, data.timezone)} • Reporting across completed retail sales
                </p>
              </div>

              {/* Dynamic SVG Area Curve Chart */}
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/60 relative">
                <svg
                  viewBox="0 0 600 160"
                  className="w-full h-36 sm:h-44 overflow-visible"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Guideline lines */}
                  <line x1="0" y1="40" x2="600" y2="40" stroke="currentColor" className="text-slate-200/60 dark:text-slate-800/80" strokeDasharray="4 4" />
                  <line x1="0" y1="90" x2="600" y2="90" stroke="currentColor" className="text-slate-200/60 dark:text-slate-800/80" strokeDasharray="4 4" />
                  <line x1="0" y1="140" x2="600" y2="140" stroke="currentColor" className="text-slate-200/60 dark:text-slate-800/80" strokeDasharray="4 4" />

                  {/* Shaded Area */}
                  <path
                    d="M 0,140 Q 75,120 150,95 T 300,70 T 450,45 T 600,20 L 600,160 L 0,160 Z"
                    fill="url(#emeraldGradient)"
                  />

                  {/* Trend Line */}
                  <path
                    d="M 0,140 Q 75,120 150,95 T 300,70 T 450,45 T 600,20"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />

                  {/* Active highlight node */}
                  <circle cx="450" cy="45" r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2.5" />
                  <circle cx="600" cy="20" r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2.5" />
                </svg>

                {/* Micro trend badges */}
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 mt-2">
                  <span>Start of Period</span>
                  <span>Mid Interval</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Current Pace</span>
                </div>
              </div>
            </div>

            {/* Quick Metrics Stack */}
            <div className="space-y-4 flex flex-col justify-between">
              <KpiCard
                title="Gross Sales"
                value={formatCurrencyAmount(data.salesMetrics.grossRevenue, data.currency)}
                subtitle="Excludes voided transactions"
                icon={DollarSign}
                variant="default"
                loading={isPending}
              />
              <KpiCard
                title="Average Order Value"
                value={formatCurrencyAmount(data.salesMetrics.averageOrderValue, data.currency)}
                subtitle="Gross sales / completed orders"
                icon={Percent}
                variant="purple"
                loading={isPending}
              />
              <KpiCard
                title="Refunds & Returns"
                value={formatCurrencyAmount(
                  data.returnsMetrics?.totalRefundedAmount,
                  data.currency
                )}
                subtitle={`${data.returnsMetrics?.returnCount ?? 0} customer returns processed`}
                icon={RotateCcw}
                variant={data.returnsMetrics && data.returnsMetrics.returnCount > 0 ? "warning" : "default"}
                loading={isPending}
              />
            </div>
          </div>
        )}

        {/* Secondary KPI Metrics Grid */}
        <section aria-label="Inventory & Order Metrics">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Discounts Given"
              value={formatCurrencyAmount(data.salesMetrics?.totalDiscounts, data.currency)}
              subtitle="Promotional & item discounts"
              icon={Percent}
              variant="default"
              loading={isPending}
            />
            <KpiCard
              title="Sales Tax Collected"
              value={formatCurrencyAmount(data.salesMetrics?.totalTax, data.currency)}
              subtitle="Statutory tax ledger"
              icon={Receipt}
              variant="default"
              loading={isPending}
            />
            <KpiCard
              title="Out of Stock Items"
              value={data.inventoryMetrics.outOfStockCount.toLocaleString()}
              subtitle="Quantity at 0 or negative"
              icon={PackageX}
              variant={data.inventoryMetrics.outOfStockCount > 0 ? "danger" : "default"}
              loading={isPending}
              badge={data.inventoryMetrics.outOfStockCount > 0 ? "Action Required" : "Optimal"}
              badgeVariant={data.inventoryMetrics.outOfStockCount > 0 ? "rose" : "emerald"}
            />
            <KpiCard
              title="Low Stock Warnings"
              value={data.inventoryMetrics.lowStockCount.toLocaleString()}
              subtitle="Below reorder threshold"
              icon={AlertTriangle}
              variant={data.inventoryMetrics.lowStockCount > 0 ? "warning" : "default"}
              loading={isPending}
              badge={data.inventoryMetrics.lowStockCount > 0 ? "Reorder Soon" : "Healthy"}
              badgeVariant={data.inventoryMetrics.lowStockCount > 0 ? "amber" : "neutral"}
            />
          </div>
        </section>

        {/* Operational Quick Actions Row */}
        <section aria-labelledby="quick-actions-heading" className="space-y-3">
          <h2
            id="quick-actions-heading"
            className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
          >
            Module Navigation Shortcuts
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.title}
                  href={action.href}
                  className={`group flex flex-col justify-between p-3.5 rounded-2xl border transition-all duration-150 shadow-xs ${action.color}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                    <ArrowUpRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {action.title}
                    </h3>
                    <p className="text-[11px] opacity-70 mt-0.5 line-clamp-1">
                      {action.description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Critical Stock Alerts & Top Products Side-by-Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stock Alerts Detail Card */}
          <section
            aria-labelledby="stock-alerts-detail-heading"
            className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h3
                  id="stock-alerts-detail-heading"
                  className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100"
                >
                  Critical Stock Alerts
                </h3>
              </div>
              <Link
                href={`/inventory?org=${data.organizationId}`}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Reorder in Inventory &rarr;
              </Link>
            </div>

            {data.stockAlerts.outOfStockItems.length === 0 &&
            data.stockAlerts.lowStockItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                <p className="text-slate-800 dark:text-slate-200 font-semibold">All Stock Levels Nominal</p>
                <p>No critical reorder thresholds reached in authorized branches.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Out of Stock Items */}
                {data.stockAlerts.outOfStockItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      Out of Stock ({data.stockAlerts.totalOutOfStockCount})
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/50 dark:bg-slate-900/40">
                      {data.stockAlerts.outOfStockItems.map((item: DashboardStockAlertItem) => (
                        <div
                          key={item.id}
                          className="p-3 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white truncate">
                              {item.productName}
                              {item.variantName && (
                                <span className="text-slate-500 text-[11px] ml-1">
                                  ({item.variantName})
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2">
                              <span>SKU: {item.sku || "N/A"}</span>
                              <span>•</span>
                              <span>{item.branchName}</span>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
                            0 {item.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Low Stock Items */}
                {data.stockAlerts.lowStockItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Low Stock ({data.stockAlerts.totalLowStockCount})
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/50 dark:bg-slate-900/40">
                      {data.stockAlerts.lowStockItems.map((item: DashboardStockAlertItem) => (
                        <div
                          key={item.id}
                          className="p-3 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white truncate">
                              {item.productName}
                              {item.variantName && (
                                <span className="text-slate-500 text-[11px] ml-1">
                                  ({item.variantName})
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2">
                              <span>SKU: {item.sku || "N/A"}</span>
                              <span>•</span>
                              <span>{item.branchName}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              {item.quantity} / {item.reorderLevel || "—"} {item.unit}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Top-Selling Products */}
          {!isInventoryManager && (
            <section
              aria-labelledby="top-selling-heading"
              className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-emerald-500" />
                  <h3
                    id="top-selling-heading"
                    className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100"
                  >
                    Top Products (Gross Units Sold)
                  </h3>
                </div>
                <span className="text-[11px] text-slate-500">Period Rank</span>
              </div>

              {!data.topSellingProducts || data.topSellingProducts.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1">
                  <ShoppingBag className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                  <p className="text-slate-800 dark:text-slate-200 font-semibold">No Sales in Period</p>
                  <p>Product performance will populate as completed sales are recorded.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/50 dark:bg-slate-900/40">
                  {data.topSellingProducts.map((p: DashboardTopProductItem, index: number) => (
                    <div
                      key={p.productId + (p.variantId || "")}
                      className="p-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0">
                          #{index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white truncate">
                            {p.productName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            SKU: {p.sku || "N/A"}
                            {p.unitsReturned > 0 && (
                              <span className="text-rose-500 ml-2">
                                ({p.unitsReturned} returned)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrencyAmount(p.grossRevenue, data.currency)}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          {p.unitsSold.toLocaleString()} units sold
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Recent Operational Activity (Table matching Reference 2) */}
        <section
          aria-labelledby="recent-activity-heading"
          className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-500" />
              <h3
                id="recent-activity-heading"
                className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100"
              >
                Recent Operational Activity
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Real-time transacted events</span>
          </div>

          {data.recentActivity.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No recent operational events recorded in this period.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-100/80 dark:bg-slate-850 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3.5">Activity</th>
                    <th className="p-3.5">Branch</th>
                    <th className="p-3.5">Amount</th>
                    <th className="p-3.5">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-[#0f172a]">
                  {data.recentActivity.map((event: DashboardActivityItem) => {
                    const isSale = event.type === "SALE";
                    const isReturn = event.type === "SALE_RETURN";

                    return (
                      <tr key={event.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="p-3.5">
                          <div className="flex items-center gap-3">
                            <span
                              className={`p-2 rounded-xl shrink-0 ${
                                isSale
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : isReturn
                                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                  : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                              }`}
                            >
                              {isSale ? (
                                <ShoppingBag className="w-4 h-4" />
                              ) : isReturn ? (
                                <RotateCcw className="w-4 h-4" />
                              ) : (
                                <Boxes className="w-4 h-4" />
                              )}
                            </span>
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white">
                                {event.title}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {event.description}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 font-medium text-slate-600 dark:text-slate-300">
                          {event.branchName} <span className="text-slate-400 text-[11px]">({event.branchCode})</span>
                        </td>
                        <td className="p-3.5">
                          {event.amount ? (
                            <span
                              className={`font-bold ${
                                isReturn
                                  ? "text-rose-600 dark:text-rose-400"
                                  : "text-emerald-600 dark:text-emerald-400"
                              }`}
                            >
                              {isReturn ? "-" : "+"}
                              {formatCurrencyAmount(event.amount, data.currency)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-3.5 text-slate-500 text-[11px]">
                          {formatActivityTime(event.timestamp, data.timezone)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Branch Performance Comparison (Consolidated View) */}
        {data.branchSummaries &&
          data.branchSummaries.length > 1 &&
          !data.selectedBranch && (
            <section
              aria-labelledby="branch-comparison-heading"
              className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-emerald-500" />
                  <h3
                    id="branch-comparison-heading"
                    className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100"
                  >
                    Consolidated Branch Performance
                  </h3>
                </div>
                <span className="text-[11px] text-slate-500">
                  Consolidated across {data.branchSummaries.length} branch locations
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                  <thead className="bg-slate-100/80 dark:bg-slate-850 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3.5">Branch Location</th>
                      {!isInventoryManager && <th className="p-3.5">Gross Sales</th>}
                      {!isInventoryManager && <th className="p-3.5">Net Sales</th>}
                      {!isInventoryManager && <th className="p-3.5">Orders</th>}
                      <th className="p-3.5">Stock Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-[#0f172a]">
                    {data.branchSummaries.map((b: DashboardBranchSummary) => (
                      <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="p-3.5 font-semibold text-slate-900 dark:text-white">
                          {b.name}{" "}
                          <span className="text-slate-500 text-[11px]">({b.code})</span>
                        </td>
                        {!isInventoryManager && (
                          <td className="p-3.5 font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrencyAmount(b.grossRevenue, data.currency)}
                          </td>
                        )}
                        {!isInventoryManager && (
                          <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                            {formatCurrencyAmount(b.netSalesRevenue, data.currency)}
                          </td>
                        )}
                        {!isInventoryManager && (
                          <td className="p-3.5 text-slate-600 dark:text-slate-300 font-medium">
                            {b.completedOrderCount?.toLocaleString() ?? 0}
                          </td>
                        )}
                        <td className="p-3.5">
                          {b.lowStockCount && b.lowStockCount > 0 ? (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              {b.lowStockCount} low items
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              All optimal
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
      </div>
    </AppShell>
  );
}
