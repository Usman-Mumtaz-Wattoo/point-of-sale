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
} from "lucide-react";
import { signOutAction } from "@/app/auth/actions";
import { getDashboardMetricsAction } from "./actions";
import { KpiCard } from "./kpi-card";
import type {
  DashboardMetricsDTO,
  DashboardDatePreset,
  SelectedBranchInfo,
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
          const res = await getDashboardMetricsAction({
            branchId: branchId ? branchId : undefined,
            datePreset: preset,
            startDate: preset === "custom" ? start : undefined,
            endDate: preset === "custom" ? end : undefined,
          });

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
    []
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
            full visibility of authorized inventory thresholds, out-of-stock items, and stock
            reorder requirements.
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
              className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
            >
              View Full Inventory &rarr;
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
