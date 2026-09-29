"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  RotateCcw,
  DollarSign,
  ShoppingBag,
  Percent,
  Receipt,
  Filter,
  X,
  ArrowLeft,
  ChevronDown,
  Calendar,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { listSalesAction } from "./actions";
import { SalesTable } from "./sales-table";
import {
  type SerializedPaginatedSales,
  type SaleStatus,
  type SalePaymentStatus,
  type ListSalesActionParams,
} from "./types";

interface BranchOption {
  id: string;
  name: string;
  code: string;
}

interface SalesViewProps {
  organizationId: string;
  organizationName: string;
  organizationTimezone?: string;
  organizationCurrency?: string;
  userRole: string;
  userName: string;
  branches: BranchOption[];
  initialSales: SerializedPaginatedSales;
}

type DatePreset = "all" | "today" | "yesterday" | "last7days" | "thisMonth" | "custom";

function formatCurrency(amount: string | number, currency = "USD"): string {
  const num = typeof amount === "number" ? amount : parseFloat(amount || "0");
  if (isNaN(num)) return `${currency} 0.00`;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${currency} ${num.toFixed(2)}`;
  }
}

/**
 * Calculates a precise UTC Date for a local calendar date/time in an IANA timezone
 * without requiring third-party libraries.
 */
function getUtcDateForTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  min: number,
  sec: number,
  ms: number,
  tz: string
): Date {
  try {
    const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const str = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "longOffset",
    }).format(probe);
    const match = str.match(/GMT([+-]\d{2}):(\d{2})/);
    const offsetMinutes = match
      ? parseInt(match[1], 10) * 60 + (match[1].startsWith("-") ? -1 : 1) * parseInt(match[2], 10)
      : 0;
    const utcTimestamp = Date.UTC(year, month - 1, day, hour, min, sec, ms) - offsetMinutes * 60000;
    return new Date(utcTimestamp);
  } catch {
    return new Date(Date.UTC(year, month - 1, day, hour, min, sec, ms));
  }
}

/**
 * Calculates date range boundaries according to the organization's business timezone.
 */
function getDatePresetRange(
  preset: DatePreset,
  timeZone: string,
  customStart?: string,
  customEnd?: string
): { startDate?: string; endDate?: string } {
  if (preset === "all") return {};

  try {
    // Current date parts in target timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    const parts = formatter.formatToParts(now);
    const currYear = parseInt(parts.find((p) => p.type === "year")!.value, 10);
    const currMonth = parseInt(parts.find((p) => p.type === "month")!.value, 10); // 1-12
    const currDay = parseInt(parts.find((p) => p.type === "day")!.value, 10);

    if (preset === "today") {
      const start = getUtcDateForTimezone(currYear, currMonth, currDay, 0, 0, 0, 0, timeZone);
      const end = getUtcDateForTimezone(currYear, currMonth, currDay, 23, 59, 59, 999, timeZone);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }

    if (preset === "yesterday") {
      const yDate = new Date(Date.UTC(currYear, currMonth - 1, currDay - 1));
      const start = getUtcDateForTimezone(
        yDate.getUTCFullYear(),
        yDate.getUTCMonth() + 1,
        yDate.getUTCDate(),
        0,
        0,
        0,
        0,
        timeZone
      );
      const end = getUtcDateForTimezone(
        yDate.getUTCFullYear(),
        yDate.getUTCMonth() + 1,
        yDate.getUTCDate(),
        23,
        59,
        59,
        999,
        timeZone
      );
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }

    if (preset === "last7days") {
      const sevenDaysAgo = new Date(Date.UTC(currYear, currMonth - 1, currDay - 6));
      const start = getUtcDateForTimezone(
        sevenDaysAgo.getUTCFullYear(),
        sevenDaysAgo.getUTCMonth() + 1,
        sevenDaysAgo.getUTCDate(),
        0,
        0,
        0,
        0,
        timeZone
      );
      const end = getUtcDateForTimezone(currYear, currMonth, currDay, 23, 59, 59, 999, timeZone);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }

    if (preset === "thisMonth") {
      const start = getUtcDateForTimezone(currYear, currMonth, 1, 0, 0, 0, 0, timeZone);
      const end = getUtcDateForTimezone(currYear, currMonth, currDay, 23, 59, 59, 999, timeZone);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }

    if (preset === "custom") {
      let startDateStr: string | undefined;
      let endDateStr: string | undefined;

      if (customStart?.trim()) {
        const [y, m, d] = customStart.split("-").map((v) => parseInt(v, 10));
        if (y && m && d) {
          startDateStr = getUtcDateForTimezone(y, m, d, 0, 0, 0, 0, timeZone).toISOString();
        }
      }

      if (customEnd?.trim()) {
        const [y, m, d] = customEnd.split("-").map((v) => parseInt(v, 10));
        if (y && m && d) {
          endDateStr = getUtcDateForTimezone(y, m, d, 23, 59, 59, 999, timeZone).toISOString();
        }
      }

      return { startDate: startDateStr, endDate: endDateStr };
    }
  } catch (err) {
    console.error("Error computing timezone date range:", err);
  }

  return {};
}

export function SalesView({
  organizationId,
  organizationName,
  organizationTimezone = "UTC",
  organizationCurrency = "USD",
  userRole,
  userName,
  branches,
  initialSales,
}: SalesViewProps) {
  // State for Sales Listing & KPIs
  const [salesData, setSalesData] = useState<SerializedPaginatedSales>(initialSales);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<SaleStatus | "ALL">("ALL");
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<SalePaymentStatus | "ALL">("ALL");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Concurrency guard to prevent stale responses from overwriting newer user requests
  const requestIdRef = useRef(0);

  // Execute fetch with current filters
  const fetchSales = useCallback(
    (pageToLoad: number, overrideParams?: Partial<ListSalesActionParams>) => {
      const currentRequestId = ++requestIdRef.current;
      setErrorMessage(null);

      // Compute date boundaries
      const dateBounds = getDatePresetRange(
        datePreset,
        organizationTimezone,
        customStartDate,
        customEndDate
      );

      const params: ListSalesActionParams = {
        page: pageToLoad,
        pageSize: 25,
        search: searchQuery.trim() || undefined,
        branchId: selectedBranchId.trim() || undefined,
        status: selectedStatus === "ALL" ? undefined : selectedStatus,
        paymentStatus: selectedPaymentStatus === "ALL" ? undefined : selectedPaymentStatus,
        startDate: dateBounds.startDate,
        endDate: dateBounds.endDate,
        ...overrideParams,
      };

      startTransition(async () => {
        try {
          const res = await listSalesAction(params, organizationId);
          if (requestIdRef.current !== currentRequestId) return; // Stale request

          if (res.success && res.data) {
            setSalesData(res.data);
            setCurrentPage(res.data.page);
          } else {
            setErrorMessage(res.error || "Failed to load sales history.");
          }
        } catch {
          if (requestIdRef.current !== currentRequestId) return;
          setErrorMessage("Network error occurred while fetching sales orders. Please try again.");
        }
      });
    },
    [
      organizationId,
      organizationTimezone,
      datePreset,
      customStartDate,
      customEndDate,
      searchQuery,
      selectedBranchId,
      selectedStatus,
      selectedPaymentStatus,
    ]
  );

  // Count active filters
  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    selectedBranchId !== "" ||
    selectedStatus !== "ALL" ||
    selectedPaymentStatus !== "ALL" ||
    datePreset !== "all";

  // Reset all filters
  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedBranchId("");
    setSelectedStatus("ALL");
    setSelectedPaymentStatus("ALL");
    setDatePreset("all");
    setCustomStartDate("");
    setCustomEndDate("");
    setCurrentPage(1);

    const currentRequestId = ++requestIdRef.current;
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const res = await listSalesAction({ page: 1, pageSize: 25 }, organizationId);
        if (requestIdRef.current !== currentRequestId) return;
        if (res.success && res.data) {
          setSalesData(res.data);
          setCurrentPage(1);
        }
      } catch {
        // error handling
      }
    });
  };

  // Trigger search / filter submit
  const handleApplyFilters = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    fetchSales(1);
  };

  // Handle pagination navigation
  const handlePageChange = (newPage: number) => {
    fetchSales(newPage);
  };

  // Auto-refresh when dropdown filters change
  const handleBranchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedBranchId(e.target.value);
    fetchSales(1, { branchId: e.target.value || undefined });
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as SaleStatus | "ALL";
    setSelectedStatus(val);
    fetchSales(1, { status: val === "ALL" ? undefined : val });
  };

  const handlePaymentStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as SalePaymentStatus | "ALL";
    setSelectedPaymentStatus(val);
    fetchSales(1, { paymentStatus: val === "ALL" ? undefined : val });
  };

  const handleDatePresetChange = (newPreset: DatePreset) => {
    setDatePreset(newPreset);
    if (newPreset !== "custom") {
      const bounds = getDatePresetRange(newPreset, organizationTimezone);
      fetchSales(1, { startDate: bounds.startDate, endDate: bounds.endDate });
    }
  };

  // KPI stats from returned aggregation
  const kpis = salesData.kpiSummary || {
    totalSalesCount: salesData.totalItems,
    totalCompletedRevenue: "0.00",
    totalDiscountAmount: "0.00",
    totalTaxAmount: "0.00",
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Navigation & Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Link
                href="/dashboard"
                className="hover:text-emerald-400 transition-colors flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </Link>
              <span>/</span>
              <span className="text-slate-200 font-medium">{organizationName}</span>
              <span>/</span>
              <span className="text-emerald-400">Sales History</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">Sales Orders & History</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {userRole}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Logged in as <strong className="text-slate-300">{userName}</strong> • Timezone:{" "}
              <span className="text-slate-300 font-mono">{organizationTimezone}</span>
            </p>
          </div>

          {/* Quick Action Links */}
          <div className="flex items-center gap-2.5">
            {["OWNER", "MANAGER", "CASHIER"].includes(userRole) && (
              <Link
                href={`/pos?org=${organizationId}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-sm shadow-emerald-950/40"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Open POS Terminal &rarr;</span>
              </Link>
            )}
            <Link
              href={`/sales/returns?org=${organizationId}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 hover:border-slate-600 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Sales Returns &rarr;</span>
            </Link>
          </div>
        </div>

        {/* KPI Cards Header */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Completed Orders */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
              <span>Completed Orders</span>
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-white tracking-tight">
              {kpis.totalSalesCount}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Reflects active filters</div>
          </div>

          {/* Card 2: Total Revenue */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
              <span>Completed Revenue</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400 tracking-tight">
              {formatCurrency(kpis.totalCompletedRevenue, organizationCurrency)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Excludes voided orders</div>
          </div>

          {/* Card 3: Total Discounts Given */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
              <span>Discounts Granted</span>
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                <Percent className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-amber-400 tracking-tight">
              {formatCurrency(kpis.totalDiscountAmount, organizationCurrency)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Order & line promotions</div>
          </div>

          {/* Card 4: Total Tax Collected */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
              <span>Tax Collected</span>
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-purple-300 tracking-tight">
              {formatCurrency(kpis.totalTaxAmount, organizationCurrency)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Applicable sales tax</div>
          </div>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => fetchSales(currentPage)}
              className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[11px] font-semibold transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Filter Toolbar Card */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4 shadow-sm">
          {/* Top Row: Search input and Clear button */}
          <form onSubmit={handleApplyFilters} className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by invoice #, receipt #, customer name or phone..."
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9.5 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    fetchSales(1, { search: undefined });
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Filter className="w-3.5 h-3.5" />
                )}
                <span>Search</span>
              </button>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  disabled={isPending}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors border border-slate-700 flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </form>

          {/* Middle Row: Date Presets */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-medium text-slate-400 mr-1 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-500" />
              <span>Date:</span>
            </span>

            {(
              [
                { id: "all", label: "All Time" },
                { id: "today", label: "Today" },
                { id: "yesterday", label: "Yesterday" },
                { id: "last7days", label: "Last 7 Days" },
                { id: "thisMonth", label: "This Month" },
                { id: "custom", label: "Custom Range" },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleDatePresetChange(preset.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  datePreset === preset.id
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 hover:text-slate-200"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers (visible only when 'custom' is selected) */}
          {datePreset === "custom" && (
            <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <label htmlFor="customStartDate" className="text-slate-400 font-medium">
                  From:
                </label>
                <input
                  id="customStartDate"
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="customEndDate" className="text-slate-400 font-medium">
                  To:
                </label>
                <input
                  id="customEndDate"
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="button"
                onClick={() => fetchSales(1)}
                className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors"
              >
                Apply Range
              </button>
            </div>
          )}

          {/* Bottom Row: Branch, Status, and Payment Status Dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-900">
            {/* Branch selector */}
            <div>
              <label htmlFor="branchSelect" className="block text-[11px] font-medium text-slate-400 mb-1">
                Branch Scope
              </label>
              <div className="relative">
                <select
                  id="branchSelect"
                  value={selectedBranchId}
                  onChange={handleBranchChange}
                  className="w-full appearance-none bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 pr-8 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">All Authorized Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </div>

            {/* Sale Status selector */}
            <div>
              <label htmlFor="statusSelect" className="block text-[11px] font-medium text-slate-400 mb-1">
                Order Status
              </label>
              <div className="relative">
                <select
                  id="statusSelect"
                  value={selectedStatus}
                  onChange={handleStatusChange}
                  className="w-full appearance-none bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 pr-8 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="VOIDED">Voided</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </div>

            {/* Payment Status selector */}
            <div>
              <label htmlFor="paymentStatusSelect" className="block text-[11px] font-medium text-slate-400 mb-1">
                Payment Status
              </label>
              <div className="relative">
                <select
                  id="paymentStatusSelect"
                  value={selectedPaymentStatus}
                  onChange={handlePaymentStatusChange}
                  className="w-full appearance-none bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 pr-8 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="ALL">All Payment Statuses</option>
                  <option value="PAID">Paid</option>
                  <option value="PARTIAL">Partial</option>
                  <option value="UNPAID">Unpaid</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Content Section: Loading Overlay or Sales Table or Empty State */}
        {salesData.items.length > 0 ? (
          <div className="relative">
            {isPending && (
              <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-xl">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 shadow-lg">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Updating sales list...</span>
                </div>
              </div>
            )}
            <SalesTable
              sales={salesData.items}
              page={salesData.page}
              pageSize={salesData.pageSize}
              totalItems={salesData.totalItems}
              totalPages={salesData.totalPages}
              currency={organizationCurrency}
              timeZone={organizationTimezone}
              isLoading={isPending}
              onPageChange={handlePageChange}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-900 text-slate-400 flex items-center justify-center mx-auto text-xl border border-slate-800">
              <Receipt className="w-6 h-6 text-slate-500" />
            </div>
            <h3 className="text-base font-semibold text-white">No Sales Orders Found</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {hasActiveFilters
                ? "No sales transactions match the current filter criteria. Try adjusting your search query, dates, or status filters."
                : "No sales have been processed for this business yet. Completed orders from the POS terminal will appear here."}
            </p>
            {hasActiveFilters ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Clear All Filters</span>
                </button>
              </div>
            ) : (
              ["OWNER", "MANAGER", "CASHIER"].includes(userRole) && (
                <div className="pt-2">
                  <Link
                    href={`/pos?org=${organizationId}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>Open POS Terminal &rarr;</span>
                  </Link>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </main>
  );
}
