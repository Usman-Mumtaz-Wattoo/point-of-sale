"use client";

import React, { useState, useTransition, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Building2,
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
import { signOutAction } from "@/app/auth/actions";
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
 * Preserves the exact backend decimal representation with localized thousands separators.
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

          // Check for stale response
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

  // Preset button config
  const presets: { id: DashboardDatePreset; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "last7days", label: "Last 7 Days" },
    { id: "last30days", label: "Last 30 Days" },
    { id: "thisMonth", label: "This Month" },
    { id: "lastMonth", label: "Last Month" },
    { id: "all", label: "All Time" },
    { id: "custom", label: "Custom" },
  ];

  const roleBadgeColor: Record<string, string> = {
    OWNER: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    MANAGER: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    ACCOUNTANT: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    CASHIER: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    INVENTORY_MANAGER: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };

  // Quick Action cards filtered by role permissions
  const quickActions = [
    {
      title: "New Sale (POS)",
      description: "Launch register for immediate checkout",
      href: `/pos?org=${data.organizationId}`,
      icon: Store,
      allowedRoles: ["OWNER", "MANAGER", "CASHIER"],
      color: "hover:border-emerald-500/50 hover:bg-emerald-950/20 text-emerald-400",
    },
    {
      title: "Sales Orders",
      description: "Review transactions and reprint receipts",
      href: `/sales?org=${data.organizationId}`,
      icon: ShoppingBag,
      allowedRoles: ["OWNER", "MANAGER", "CASHIER", "ACCOUNTANT"],
      color: "hover:border-blue-500/50 hover:bg-blue-950/20 text-blue-400",
    },
    {
      title: "Process Return",
      description: "Issue customer refunds or restock items",
      href: `/sales/returns?org=${data.organizationId}`,
      icon: RotateCcw,
      allowedRoles: ["OWNER", "MANAGER", "CASHIER", "ACCOUNTANT"],
      color: "hover:border-amber-500/50 hover:bg-amber-950/20 text-amber-400",
    },
    {
      title: "Manage Inventory",
      description: "Track stock counts, reorder and adjust",
      href: `/inventory?org=${data.organizationId}`,
      icon: Boxes,
      allowedRoles: ["OWNER", "MANAGER", "INVENTORY_MANAGER", "CASHIER", "ACCOUNTANT"],
      color: "hover:border-indigo-500/50 hover:bg-indigo-950/20 text-indigo-400",
    },
    {
      title: "Purchase Orders",
      description: "Create POs and receive supplier stock",
      href: `/purchasing?org=${data.organizationId}`,
      icon: Receipt,
      allowedRoles: ["OWNER", "MANAGER", "INVENTORY_MANAGER", "ACCOUNTANT"],
      color: "hover:border-sky-500/50 hover:bg-sky-950/20 text-sky-400",
    },
    {
      title: "Customers",
      description: "Manage buyer accounts and loyalty",
      href: `/customers?org=${data.organizationId}`,
      icon: Users,
      allowedRoles: ["OWNER", "MANAGER", "CASHIER", "ACCOUNTANT"],
      color: "hover:border-purple-500/50 hover:bg-purple-950/20 text-purple-400",
    },
    {
      title: "Catalog",
      description: "Configure products, variants and pricing",
      href: `/catalog?org=${data.organizationId}`,
      icon: Layers,
      allowedRoles: ["OWNER", "MANAGER", "INVENTORY_MANAGER", "CASHIER", "ACCOUNTANT"],
      color: "hover:border-slate-500/50 hover:bg-slate-900/40 text-slate-300",
    },
  ].filter((action) => action.allowedRoles.includes(data.userRole));

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Application Header */}
      <header className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-6 backdrop-blur-md shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Organization & User Info */}
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Building2 className="w-5 h-5" aria-hidden="true" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {data.organizationName}
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  roleBadgeColor[data.userRole] || "bg-slate-800 text-slate-300 border-slate-700"
                }`}
              >
                {data.userRole}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400">
              Executive Business Overview • Logged in as{" "}
              <span className="text-slate-200 font-medium">{userName}</span> ({userEmail})
            </p>
          </div>

          {/* Module Navigation & Sign Out */}
          <div className="flex items-center gap-2 flex-wrap">
            {["OWNER", "MANAGER", "CASHIER"].includes(data.userRole) && (
              <Link
                href={`/pos?org=${data.organizationId}`}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-sm"
              >
                POS Register &rarr;
              </Link>
            )}
            {["OWNER", "MANAGER", "CASHIER", "ACCOUNTANT"].includes(data.userRole) && (
              <Link
                href={`/sales?org=${data.organizationId}`}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              >
                Sales Orders
              </Link>
            )}
            {!isInventoryManager && (
              <Link
                href={`/sales/returns?org=${data.organizationId}`}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              >
                Returns
              </Link>
            )}
            <Link
              href={`/inventory?org=${data.organizationId}`}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              Inventory
            </Link>
            {["OWNER", "MANAGER", "INVENTORY_MANAGER", "ACCOUNTANT"].includes(data.userRole) && (
              <Link
                href={`/purchasing?org=${data.organizationId}`}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              >
                Purchasing
              </Link>
            )}
            {!isInventoryManager && (
              <Link
                href={`/customers?org=${data.organizationId}`}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              >
                Customers
              </Link>
            )}
            <Link
              href={`/catalog?org=${data.organizationId}`}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              Catalog
            </Link>
            {data.userRole === "OWNER" && (
              <Link
                href={`/settings?org=${data.organizationId}`}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              >
                Settings
              </Link>
            )}
            <form action={signOutAction}>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 border border-rose-800/40 transition-colors"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Role Segregation Notice for INVENTORY_MANAGER */}
      {isInventoryManager && (
        <div
          role="status"
          className="flex items-center gap-3 p-4 rounded-xl bg-orange-950/30 border border-orange-800/40 text-orange-200 text-xs sm:text-sm"
        >
          <AlertCircle className="w-5 h-5 shrink-0 text-orange-400" />
          <div>
            <strong className="font-semibold text-orange-300">
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
          className="flex items-center justify-between gap-3 p-4 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-200 text-xs sm:text-sm"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={handleRefresh}
            className="px-3 py-1 text-xs font-medium rounded bg-rose-900/60 hover:bg-rose-800 text-white border border-rose-700 transition-colors shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filter & Control Bar */}
      <section
        aria-label="Dashboard Filters"
        className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Date Presets Group */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-slate-400 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Range:
            </span>
            {presets.map((p) => {
              const active = selectedPreset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handlePresetChange(p.id)}
                  disabled={isPending}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${
                    active
                      ? "bg-emerald-600 text-white border-emerald-500 shadow-sm"
                      : "bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800 hover:border-slate-700"
                  } ${isPending ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Branch Filter & Refresh */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Branch Selector: only shown if multiple branches or authorized to view all */}
            {(hasMultipleBranches || canSelectAllBranches) ? (
              <div className="flex items-center gap-2">
                <label htmlFor="dashboard-branch-select" className="text-xs font-medium text-slate-400 flex items-center gap-1">
                  <Store className="w-3.5 h-3.5" />
                  Branch:
                </label>
                <div className="relative">
                  <select
                    id="dashboard-branch-select"
                    value={selectedBranchId}
                    onChange={(e) => handleBranchChange(e.target.value)}
                    disabled={isPending}
                    className="appearance-none bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:border-emerald-500 transition-colors"
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
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
                <Store className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  Branch: <strong className="text-white">{data.selectedBranch.name}</strong> ({data.selectedBranch.code})
                </span>
              </div>
            ) : null}

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isPending}
              title="Refresh dashboard metrics"
              aria-label="Refresh metrics"
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${isPending ? "animate-spin text-emerald-400" : ""}`}
              />
            </button>
          </div>
        </div>

        {/* Custom Date Range Picker (Accordion/Inline form) */}
        {customFormOpen && (
          <form
            onSubmit={handleCustomApply}
            className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center gap-3 text-xs"
          >
            <div className="flex items-center gap-2">
              <label htmlFor="custom-start-date" className="text-slate-400">
                Start:
              </label>
              <input
                id="custom-start-date"
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="custom-end-date" className="text-slate-400">
                End:
              </label>
              <input
                id="custom-end-date"
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
            >
              Apply Custom Range
            </button>
            {customError && (
              <span className="text-rose-400 text-xs font-medium">{customError}</span>
            )}
          </form>
        )}

        {/* Context Strip: Selected Period & Timezone Display */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80 flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1 text-slate-300">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              Period:{" "}
              <strong className="text-white font-medium">
                {formatPeriodDisplay(data.dateRange, data.timezone)}
              </strong>
            </span>
            <span>•</span>
            <span>
              Timezone: <strong className="text-slate-200">{data.timezone}</strong>
            </span>
            <span>•</span>
            <span>
              Scope:{" "}
              <strong className="text-slate-200">
                {data.selectedBranch
                  ? `${data.selectedBranch.name} (${data.selectedBranch.code})`
                  : "All Permitted Branches"}
              </strong>
            </span>
          </div>

          {isPending && (
            <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              Updating metrics...
            </span>
          )}
        </div>
      </section>

      {/* Quick Action Navigation Grid (Step 19C) */}
      <section aria-labelledby="quick-actions-heading" className="space-y-3">
        <h2 id="quick-actions-heading" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Operational Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.title}
                href={action.href}
                className={`group flex flex-col justify-between p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 transition-all duration-150 ${action.color}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                  <ArrowUpRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-white group-hover:text-emerald-300 transition-colors">
                    {action.title}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    {action.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Primary KPI Metrics Content */}
      <main className="space-y-8" aria-label="Executive Performance Metrics">
        {/* Sales & Financial Section (Hidden for INVENTORY_MANAGER) */}
        {!isInventoryManager && data.salesMetrics && (
          <section aria-labelledby="sales-metrics-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2
                id="sales-metrics-heading"
                className="text-sm font-semibold uppercase tracking-wider text-slate-300"
              >
                Executive Financial & Sales Performance
              </h2>
              {data.salesMetrics.completedOrderCount === 0 && (
                <span className="text-xs text-slate-500">
                  No sales recorded for the selected window
                </span>
              )}
            </div>

            {/* Row 1: Primary Revenue & Order Volume */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title="Net Sales Revenue"
                value={formatCurrencyAmount(data.netSalesRevenue, data.currency)}
                subtitle="Gross sales minus processed refunds"
                icon={TrendingUp}
                variant="success"
                loading={isPending}
                badge="Net"
                badgeVariant="emerald"
              />
              <KpiCard
                title="Gross Sales"
                value={formatCurrencyAmount(data.salesMetrics.grossRevenue, data.currency)}
                subtitle="Excludes voided and draft sales"
                icon={DollarSign}
                variant="default"
                loading={isPending}
              />
              <KpiCard
                title="Completed Orders"
                value={data.salesMetrics.completedOrderCount.toLocaleString()}
                subtitle="Eligible fulfilled transactions"
                icon={ShoppingBag}
                variant="info"
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
            </div>

            {/* Row 2: Secondary Financials (Discounts, Tax, Returns) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title="Discounts Given"
                value={formatCurrencyAmount(data.salesMetrics.totalDiscounts, data.currency)}
                subtitle="Order & item level discounts"
                icon={Percent}
                variant="default"
                loading={isPending}
              />
              <KpiCard
                title="Sales Tax Collected"
                value={formatCurrencyAmount(data.salesMetrics.totalTax, data.currency)}
                subtitle="Statutory tax collected"
                icon={Receipt}
                variant="default"
                loading={isPending}
              />
              <KpiCard
                title="Processed Returns"
                value={
                  data.returnsMetrics
                    ? data.returnsMetrics.returnCount.toLocaleString()
                    : "0"
                }
                subtitle="Completed return orders"
                icon={RotateCcw}
                variant="warning"
                loading={isPending}
                badge={
                  data.returnsMetrics && data.returnsMetrics.returnCount > 0
                    ? `${data.returnsMetrics.returnCount} returns`
                    : undefined
                }
                badgeVariant="amber"
              />
              <KpiCard
                title="Total Refunded"
                value={formatCurrencyAmount(
                  data.returnsMetrics?.totalRefundedAmount,
                  data.currency
                )}
                subtitle="Approved monetary refunds"
                icon={RotateCcw}
                variant="danger"
                loading={isPending}
              />
            </div>
          </section>
        )}

        {/* Inventory Overview Section (Visible to authorized roles) */}
        <section aria-labelledby="inventory-metrics-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2
              id="inventory-metrics-heading"
              className="text-sm font-semibold uppercase tracking-wider text-slate-300"
            >
              Inventory Health & Stock Alerts
            </h2>
            <Link
              href={`/inventory?org=${data.organizationId}`}
              className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium flex items-center gap-1"
            >
              Full Stock Ledger <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              title="Out of Stock Items"
              value={data.inventoryMetrics.outOfStockCount.toLocaleString()}
              subtitle="Stock quantity at 0 or negative"
              icon={PackageX}
              variant={data.inventoryMetrics.outOfStockCount > 0 ? "danger" : "default"}
              loading={isPending}
              badge={
                data.inventoryMetrics.outOfStockCount > 0 ? "Action Required" : "Optimal"
              }
              badgeVariant={
                data.inventoryMetrics.outOfStockCount > 0 ? "rose" : "emerald"
              }
            />
            <KpiCard
              title="Low Stock Warnings"
              value={data.inventoryMetrics.lowStockCount.toLocaleString()}
              subtitle="Quantity below reorder threshold"
              icon={AlertTriangle}
              variant={data.inventoryMetrics.lowStockCount > 0 ? "warning" : "default"}
              loading={isPending}
              badge={
                data.inventoryMetrics.lowStockCount > 0 ? "Reorder Soon" : "Healthy"
              }
              badgeVariant={
                data.inventoryMetrics.lowStockCount > 0 ? "amber" : "neutral"
              }
            />
            <KpiCard
              title="Total Tracked Items"
              value={data.inventoryMetrics.totalTrackedItems.toLocaleString()}
              subtitle="Active variants in authorized branches"
              icon={Boxes}
              variant="info"
              loading={isPending}
            />
          </div>
        </section>

        {/* Step 19C: Operational Insights (Stock Alerts & Top Products) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stock Alerts Detail Card */}
          <section
            aria-labelledby="stock-alerts-detail-heading"
            className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3
                  id="stock-alerts-detail-heading"
                  className="text-xs font-semibold uppercase tracking-wider text-slate-200"
                >
                  Critical Stock Alerts
                </h3>
              </div>
              <Link
                href={`/inventory?org=${data.organizationId}`}
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                Reorder in Inventory &rarr;
              </Link>
            </div>

            {data.stockAlerts.outOfStockItems.length === 0 &&
            data.stockAlerts.lowStockItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1.5" />
                <p className="text-slate-300 font-medium">All Stock Levels Nominal</p>
                <p>No critical reorder thresholds reached in authorized branches.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Out of Stock Items */}
                {data.stockAlerts.outOfStockItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                      Out of Stock ({data.stockAlerts.totalOutOfStockCount})
                    </div>
                    <div className="divide-y divide-slate-800/60 rounded-lg border border-slate-800/80 overflow-hidden bg-slate-900/40">
                      {data.stockAlerts.outOfStockItems.map((item: DashboardStockAlertItem) => (
                        <div
                          key={item.id}
                          className="p-2.5 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-white truncate">
                              {item.productName}
                              {item.variantName && (
                                <span className="text-slate-400 text-[11px] ml-1">
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
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
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
                    <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      Low Stock ({data.stockAlerts.totalLowStockCount})
                    </div>
                    <div className="divide-y divide-slate-800/60 rounded-lg border border-slate-800/80 overflow-hidden bg-slate-900/40">
                      {data.stockAlerts.lowStockItems.map((item: DashboardStockAlertItem) => (
                        <div
                          key={item.id}
                          className="p-2.5 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-white truncate">
                              {item.productName}
                              {item.variantName && (
                                <span className="text-slate-400 text-[11px] ml-1">
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
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
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

          {/* Top-Selling Products (Hidden for INVENTORY_MANAGER) */}
          {!isInventoryManager && (
            <section
              aria-labelledby="top-selling-heading"
              className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-emerald-400" />
                  <h3
                    id="top-selling-heading"
                    className="text-xs font-semibold uppercase tracking-wider text-slate-200"
                  >
                    Top Products (Gross Units Sold)
                  </h3>
                </div>
                <span className="text-[11px] text-slate-500">Period Rank</span>
              </div>

              {!data.topSellingProducts || data.topSellingProducts.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                  <ShoppingBag className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                  <p className="text-slate-300 font-medium">No Sales in Period</p>
                  <p>Product performance will populate as completed sales are recorded.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/60 rounded-lg border border-slate-800/80 overflow-hidden bg-slate-900/40">
                  {data.topSellingProducts.map((p: DashboardTopProductItem, index: number) => (
                    <div
                      key={p.productId + (p.variantId || "")}
                      className="p-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 shrink-0">
                          #{index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium text-white truncate">
                            {p.productName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            SKU: {p.sku || "N/A"}
                            {p.unitsReturned > 0 && (
                              <span className="text-rose-400/80 ml-2">
                                ({p.unitsReturned} returned)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-semibold text-emerald-400">
                          {formatCurrencyAmount(p.grossRevenue, data.currency)}
                        </div>
                        <div className="text-[11px] text-slate-400 font-medium">
                          {p.unitsSold.toLocaleString()} units sold
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* If INVENTORY_MANAGER, show placeholder for balanced layout */}
          {isInventoryManager && (
            <section
              aria-label="Stock Optimization Tips"
              className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-3"
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-orange-400" />
                Inventory Reordering Guidance
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Items marked as <strong>Low Stock</strong> have reached or dipped below their branch
                reorder threshold. Create a Purchase Order in the Purchasing module to replenish
                safety stock before out-of-stock events disrupt retail fulfillment.
              </p>
              <div className="pt-2">
                <Link
                  href={`/purchasing?org=${data.organizationId}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600/20 text-orange-300 border border-orange-500/30 text-xs font-semibold hover:bg-orange-600/30 transition-colors"
                >
                  Create Replenishment PO &rarr;
                </Link>
              </div>
            </section>
          )}
        </div>

        {/* Step 19C: Recent Operational Activity */}
        <section
          aria-labelledby="recent-activity-heading"
          className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <h3
                id="recent-activity-heading"
                className="text-xs font-semibold uppercase tracking-wider text-slate-200"
              >
                Recent Operational Activity
              </h3>
            </div>
            <span className="text-[11px] text-slate-500">Latest Transacted Events</span>
          </div>

          {data.recentActivity.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              No recent operational events recorded.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60 rounded-lg border border-slate-800/80 overflow-hidden bg-slate-900/40">
              {data.recentActivity.map((event: DashboardActivityItem) => {
                const isSale = event.type === "SALE";
                const isReturn = event.type === "SALE_RETURN";

                return (
                  <div
                    key={event.id}
                    className="p-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`p-1.5 rounded-lg border shrink-0 ${
                          isSale
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : isReturn
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            : "bg-blue-500/10 text-blue-400 border-blue-500/20"
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

                      <div className="min-w-0">
                        <div className="font-medium text-white truncate">
                          {event.title}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {event.description} •{" "}
                          <span className="text-slate-500">
                            {event.branchName} ({event.branchCode})
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {event.amount && (
                        <div
                          className={`font-semibold ${
                            isReturn ? "text-rose-400" : "text-emerald-400"
                          }`}
                        >
                          {isReturn ? "-" : ""}
                          {formatCurrencyAmount(event.amount, data.currency)}
                        </div>
                      )}
                      <div className="text-[10px] text-slate-500">
                        {formatActivityTime(event.timestamp, data.timezone)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Step 19C: Branch Performance Comparison (Owner/Accountant/Multi-branch Manager) */}
        {data.branchSummaries &&
          data.branchSummaries.length > 1 &&
          !data.selectedBranch && (
            <section
              aria-labelledby="branch-comparison-heading"
              className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-emerald-400" />
                  <h3
                    id="branch-comparison-heading"
                    className="text-xs font-semibold uppercase tracking-wider text-slate-200"
                  >
                    Branch Performance Comparison
                  </h3>
                </div>
                <span className="text-[11px] text-slate-500">
                  Consolidated View Across {data.branchSummaries.length} Branches
                </span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-800/80">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/80 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-3">Branch</th>
                      {!isInventoryManager && <th className="p-3">Gross Sales</th>}
                      {!isInventoryManager && <th className="p-3">Net Sales</th>}
                      {!isInventoryManager && <th className="p-3">Orders</th>}
                      <th className="p-3">Low Stock Alerts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {data.branchSummaries.map((b: DashboardBranchSummary) => (
                      <tr key={b.id} className="hover:bg-slate-900/30 transition-colors">
                        <td className="p-3 font-medium text-white">
                          {b.name}{" "}
                          <span className="text-slate-500 text-[11px]">({b.code})</span>
                        </td>
                        {!isInventoryManager && (
                          <td className="p-3 font-semibold text-emerald-400">
                            {formatCurrencyAmount(b.grossRevenue, data.currency)}
                          </td>
                        )}
                        {!isInventoryManager && (
                          <td className="p-3 font-semibold text-white">
                            {formatCurrencyAmount(b.netSalesRevenue, data.currency)}
                          </td>
                        )}
                        {!isInventoryManager && (
                          <td className="p-3 text-slate-300 font-medium">
                            {b.completedOrderCount?.toLocaleString() ?? 0}
                          </td>
                        )}
                        <td className="p-3">
                          {b.lowStockCount && b.lowStockCount > 0 ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              {b.lowStockCount} items
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[11px]">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

        {/* Empty State Banner (when no sales and no stock alerts) */}
        {!isInventoryManager &&
          data.salesMetrics &&
          data.salesMetrics.completedOrderCount === 0 &&
          data.inventoryMetrics.lowStockCount === 0 &&
          data.inventoryMetrics.outOfStockCount === 0 && (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <h3 className="text-sm font-semibold text-white">Quiet Reporting Window</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No orders have been fulfilled during this date range and all inventory stock levels
                are within nominal operating thresholds.
              </p>
            </div>
          )}
      </main>
    </div>
  );
}
