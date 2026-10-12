"use server";

import { Prisma, SaleStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentAppUser } from "@/lib/auth";
import { SYSTEM_ROLES, type SystemRoleName } from "@/lib/roles";
import {
  checkBranchAccess,
  CrossTenantViolationError,
  MembershipNotFoundError as MembershipsNotFoundError,
  UnauthorizedRoleError as MembershipsUnauthorizedRoleError,
  BranchNotFoundError,
} from "@/lib/memberships";
import {
  resolveTenantContext,
  TenantContextError,
  AuthRequiredError,
  MembershipNotFoundError,
} from "@/lib/tenant-context";
import type { AppUserContext } from "@/lib/sales";
import {
  type GetDashboardMetricsInput,
  type DashboardMetricsDTO,
  type DashboardActionResult,
  type DashboardDatePreset,
  type DashboardBranchSummary,
  type SelectedBranchInfo,
  type DashboardStockAlertItem,
  type DashboardTopProductItem,
  type DashboardActivityItem,
  type DashboardTimeSeriesPoint,
  DASHBOARD_ALLOWED_ROLES,
} from "./types";

export interface DashboardServiceOptions {
  actorUser?: AppUserContext | null;
  organizationId?: string;
}

interface VerifiedDashboardContext {
  user: AppUserContext;
  organizationId: string;
  organizationName: string;
  currency: string;
  timezone: string;
  role: SystemRoleName;
  membership: AppUserContext["memberships"][0];
}

/**
 * Validates the caller's server-side session and active organization membership
 * using the shared tenant context resolver.
 * Enforces strict multi-tenant boundaries and role authorization.
 */
async function verifyDashboardContext(
  requestedOrgId?: string,
  options?: DashboardServiceOptions
): Promise<VerifiedDashboardContext> {
  const candidateOrgId = requestedOrgId?.trim() || options?.organizationId?.trim() || undefined;

  const tenantContext = await resolveTenantContext(candidateOrgId, {
    requireRoles: DASHBOARD_ALLOWED_ROLES,
    actorUser: options?.actorUser,
  });

  const user = options?.actorUser !== undefined ? options.actorUser : await getCurrentAppUser();
  if (!user) {
    throw new AuthRequiredError();
  }

  const membership = user.memberships.find((m) => m.id === tenantContext.membershipId);
  if (!membership) {
    throw new MembershipNotFoundError();
  }

  return {
    user: user as AppUserContext,
    organizationId: tenantContext.organizationId,
    organizationName: tenantContext.organizationName,
    currency: tenantContext.organization.currency || "USD",
    timezone: tenantContext.organization.timezone || "UTC",
    role: tenantContext.role,
    membership,
  };
}

/**
 * Calculates a UTC Date corresponding to a local year, month, day, hour, min, sec in an IANA timezone.
 */
function getUtcDateForTimezone(
  year: number,
  month: number, // 1-12
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
 * Computes deterministic start and end boundaries in UTC corresponding to the organization's business timezone.
 */
function computeDateBounds(
  preset: DashboardDatePreset,
  timeZone: string,
  customStart?: string,
  customEnd?: string
): { startDate: Date | null; endDate: Date | null; resolvedPreset: DashboardDatePreset } {
  if (preset === "all") {
    return { startDate: null, endDate: null, resolvedPreset: "all" };
  }

  // Handle custom date range
  if (preset === "custom" || (customStart && customEnd)) {
    if (customStart?.trim() && customEnd?.trim()) {
      const sParts = customStart.split("-").map((v) => parseInt(v, 10));
      const eParts = customEnd.split("-").map((v) => parseInt(v, 10));

      if (
        sParts.length === 3 &&
        eParts.length === 3 &&
        !isNaN(sParts[0]) &&
        !isNaN(eParts[0])
      ) {
        const start = getUtcDateForTimezone(sParts[0], sParts[1], sParts[2], 0, 0, 0, 0, timeZone);
        const end = getUtcDateForTimezone(eParts[0], eParts[1], eParts[2], 23, 59, 59, 999, timeZone);
        return { startDate: start, endDate: end, resolvedPreset: "custom" };
      }
    }
  }

  // Calculate local date components in the business timezone
  const now = new Date();
  let currYear = now.getUTCFullYear();
  let currMonth = now.getUTCMonth() + 1; // 1-12
  let currDay = now.getUTCDate();

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    const parts = formatter.formatToParts(now);
    const yPart = parts.find((p) => p.type === "year");
    const mPart = parts.find((p) => p.type === "month");
    const dPart = parts.find((p) => p.type === "day");
    if (yPart && mPart && dPart) {
      currYear = parseInt(yPart.value, 10);
      currMonth = parseInt(mPart.value, 10);
      currDay = parseInt(dPart.value, 10);
    }
  } catch {
    // Fallback uses UTC date parts
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
    return { startDate: start, endDate: end, resolvedPreset: "yesterday" };
  }

  if (preset === "last7days") {
    const sDate = new Date(Date.UTC(currYear, currMonth - 1, currDay - 6));
    const start = getUtcDateForTimezone(
      sDate.getUTCFullYear(),
      sDate.getUTCMonth() + 1,
      sDate.getUTCDate(),
      0,
      0,
      0,
      0,
      timeZone
    );
    const end = getUtcDateForTimezone(currYear, currMonth, currDay, 23, 59, 59, 999, timeZone);
    return { startDate: start, endDate: end, resolvedPreset: "last7days" };
  }

  if (preset === "last30days") {
    const sDate = new Date(Date.UTC(currYear, currMonth - 1, currDay - 29));
    const start = getUtcDateForTimezone(
      sDate.getUTCFullYear(),
      sDate.getUTCMonth() + 1,
      sDate.getUTCDate(),
      0,
      0,
      0,
      0,
      timeZone
    );
    const end = getUtcDateForTimezone(currYear, currMonth, currDay, 23, 59, 59, 999, timeZone);
    return { startDate: start, endDate: end, resolvedPreset: "last30days" };
  }

  if (preset === "thisMonth") {
    const start = getUtcDateForTimezone(currYear, currMonth, 1, 0, 0, 0, 0, timeZone);
    const end = getUtcDateForTimezone(currYear, currMonth, currDay, 23, 59, 59, 999, timeZone);
    return { startDate: start, endDate: end, resolvedPreset: "thisMonth" };
  }

  if (preset === "lastMonth") {
    const prevMonthDate = new Date(Date.UTC(currYear, currMonth - 2, 1));
    const pYear = prevMonthDate.getUTCFullYear();
    const pMonth = prevMonthDate.getUTCMonth() + 1;
    const lastDayDate = new Date(Date.UTC(currYear, currMonth - 1, 0));
    const pLastDay = lastDayDate.getUTCDate();
    const start = getUtcDateForTimezone(pYear, pMonth, 1, 0, 0, 0, 0, timeZone);
    const end = getUtcDateForTimezone(pYear, pMonth, pLastDay, 23, 59, 59, 999, timeZone);
    return { startDate: start, endDate: end, resolvedPreset: "lastMonth" };
  }

  // Default: "today"
  const start = getUtcDateForTimezone(currYear, currMonth, currDay, 0, 0, 0, 0, timeZone);
  const end = getUtcDateForTimezone(currYear, currMonth, currDay, 23, 59, 59, 999, timeZone);
  return { startDate: start, endDate: end, resolvedPreset: "today" };
}

/**
 * Aggregates database-recorded completed sales and processed customer refunds into
 * sequential time-series intervals for the Revenue Performance Overview chart.
 *
 * Enforces:
 * - Scoped to tenant organization and authorized branch
 * - Uses organization's configured timezone for date boundaries
 * - Net revenue = completed sales minus processed refunds
 * - Excludes voided and draft sales
 */
function generateRevenueTimeSeries({
  sales,
  returns,
  startDate,
  endDate,
  preset,
  timezone,
}: {
  sales: { saleDate: Date; totalAmount: Prisma.Decimal }[];
  returns: { returnDate: Date; refundedAmount: Prisma.Decimal }[];
  startDate: Date | null;
  endDate: Date | null;
  preset: DashboardDatePreset;
  timezone: string;
}): DashboardTimeSeriesPoint[] {
  if (preset === "all" && sales.length === 0 && returns.length === 0) {
    return [];
  }

  const formatDateKey = (d: Date): string => {
    try {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      return formatter.format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  };

  const formatHourKey = (d: Date): number => {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
      });
      const parts = formatter.formatToParts(d);
      const h = parts.find((p) => p.type === "hour");
      return h ? parseInt(h.value, 10) : d.getUTCHours();
    } catch {
      return d.getUTCHours();
    }
  };

  const formatShortDayLabel = (dateStr: string): string => {
    try {
      const [y, m, d] = dateStr.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      return new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        month: "short",
        day: "numeric",
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  if (preset === "today" || preset === "yesterday") {
    const buckets: {
      hour: number;
      label: string;
      grossRevenue: Prisma.Decimal;
      refundAmount: Prisma.Decimal;
      orderCount: number;
    }[] = [];

    for (let h = 0; h < 24; h++) {
      const hourStr = `${h.toString().padStart(2, "0")}:00`;
      buckets.push({
        hour: h,
        label: hourStr,
        grossRevenue: new Prisma.Decimal("0.00"),
        refundAmount: new Prisma.Decimal("0.00"),
        orderCount: 0,
      });
    }

    for (const s of sales) {
      const h = formatHourKey(s.saleDate);
      if (h >= 0 && h < 24) {
        buckets[h].grossRevenue = buckets[h].grossRevenue.plus(s.totalAmount);
        buckets[h].orderCount += 1;
      }
    }

    for (const r of returns) {
      const h = formatHourKey(r.returnDate);
      if (h >= 0 && h < 24) {
        buckets[h].refundAmount = buckets[h].refundAmount.plus(r.refundedAmount);
      }
    }

    return buckets.map((b) => {
      const net = b.grossRevenue.minus(b.refundAmount);
      return {
        date: b.label,
        label: b.label,
        netRevenue: (net.greaterThan(0) ? net : new Prisma.Decimal("0.00")).toFixed(2),
        grossRevenue: b.grossRevenue.toFixed(2),
        refundAmount: b.refundAmount.toFixed(2),
        orderCount: b.orderCount,
      };
    });
  }

  let effectiveStart: Date;
  let effectiveEnd: Date;

  if (startDate && endDate) {
    effectiveStart = startDate;
    effectiveEnd = endDate;
  } else {
    const allDates: number[] = [
      ...sales.map((s) => s.saleDate.getTime()),
      ...returns.map((r) => r.returnDate.getTime()),
    ];
    if (allDates.length === 0) {
      return [];
    }
    effectiveStart = new Date(Math.min(...allDates));
    effectiveEnd = new Date(Math.max(...allDates));
  }

  const dayBuckets = new Map<
    string,
    {
      label: string;
      grossRevenue: Prisma.Decimal;
      refundAmount: Prisma.Decimal;
      orderCount: number;
    }
  >();

  const cur = new Date(effectiveStart.getTime());
  const endKey = formatDateKey(effectiveEnd);
  let safety = 0;
  while (safety < 366) {
    const key = formatDateKey(cur);
    if (!dayBuckets.has(key)) {
      dayBuckets.set(key, {
        label: formatShortDayLabel(key),
        grossRevenue: new Prisma.Decimal("0.00"),
        refundAmount: new Prisma.Decimal("0.00"),
        orderCount: 0,
      });
    }
    if (key === endKey || cur > effectiveEnd) break;
    cur.setUTCDate(cur.getUTCDate() + 1);
    safety++;
  }

  for (const s of sales) {
    const key = formatDateKey(s.saleDate);
    let b = dayBuckets.get(key);
    if (!b) {
      b = {
        label: formatShortDayLabel(key),
        grossRevenue: new Prisma.Decimal("0.00"),
        refundAmount: new Prisma.Decimal("0.00"),
        orderCount: 0,
      };
      dayBuckets.set(key, b);
    }
    b.grossRevenue = b.grossRevenue.plus(s.totalAmount);
    b.orderCount += 1;
  }

  for (const r of returns) {
    const key = formatDateKey(r.returnDate);
    let b = dayBuckets.get(key);
    if (!b) {
      b = {
        label: formatShortDayLabel(key),
        grossRevenue: new Prisma.Decimal("0.00"),
        refundAmount: new Prisma.Decimal("0.00"),
        orderCount: 0,
      };
      dayBuckets.set(key, b);
    }
    b.refundAmount = b.refundAmount.plus(r.refundedAmount);
  }

  const sortedKeys = Array.from(dayBuckets.keys()).sort();
  return sortedKeys.map((k) => {
    const b = dayBuckets.get(k)!;
    const net = b.grossRevenue.minus(b.refundAmount);
    return {
      date: k,
      label: b.label,
      netRevenue: (net.greaterThan(0) ? net : new Prisma.Decimal("0.00")).toFixed(2),
      grossRevenue: b.grossRevenue.toFixed(2),
      refundAmount: b.refundAmount.toFixed(2),
      orderCount: b.orderCount,
    };
  });
}

/**
 * Retrieves aggregated operational metrics for the executive dashboard.
 *
 * SECURITY ENFORCEMENTS:
 * 1. Authenticated user and organization membership are resolved strictly server-side.
 * 2. Scope is bounded strictly to the caller's active tenant (`organizationId`).
 * 3. Branch access rules enforced:
 *    - OWNER & ACCOUNTANT: Organization-wide access, can filter by any active branch.
 *    - MANAGER, CASHIER, INVENTORY_MANAGER: Restricted to authorized branches.
 * 4. Role-based metric segregation:
 *    - INVENTORY_MANAGER: Receives inventory alerts only; sales & financial data are null.
 * 5. Decimal precision:
 *    - All monetary sums and averages use Prisma.Decimal arithmetic to avoid floating-point errors.
 * 6. Completed-only sales:
 *    - Voided and draft transactions are strictly excluded from gross revenue and order counts.
 */
export async function getDashboardMetricsAction(
  input?: GetDashboardMetricsInput,
  requestedOrgId?: string,
  options?: DashboardServiceOptions
): Promise<DashboardActionResult<DashboardMetricsDTO>> {
  try {
    const {
      user,
      organizationId,
      organizationName,
      currency,
      timezone,
      role,
      membership,
    } = await verifyDashboardContext(requestedOrgId, options);

    // 1. Resolve accessible branches for the caller (client branch options)
    let accessibleBranches: SelectedBranchInfo[] = [];
    if (role === SYSTEM_ROLES.OWNER || role === SYSTEM_ROLES.ACCOUNTANT) {
      accessibleBranches = await db.branch.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      });
    } else {
      const authorizedBranchIds = membership.branchMemberships
        .filter((bm) => bm.branch.isActive)
        .map((bm) => bm.branchId);

      if (authorizedBranchIds.length > 0) {
        accessibleBranches = await db.branch.findMany({
          where: {
            organizationId,
            id: { in: authorizedBranchIds },
            isActive: true,
          },
          select: { id: true, name: true, code: true },
          orderBy: { name: "asc" },
        });
      }
    }

    // 2. Validate custom date range input if requested
    if (input?.datePreset === "custom") {
      if (!input.startDate?.trim() || !input.endDate?.trim()) {
        return {
          success: false,
          error: "Please provide both start and end dates for a custom range.",
        };
      }
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(input.startDate.trim()) || !dateRegex.test(input.endDate.trim())) {
        return {
          success: false,
          error: "Custom dates must be in YYYY-MM-DD format.",
        };
      }
      if (input.startDate.trim() > input.endDate.trim()) {
        return {
          success: false,
          error: "Start date cannot be after end date.",
        };
      }
    }

    // 3. Resolve branch scoping & validate branch permissions
    let branchFilterClause: string | { in: string[] } | undefined = undefined;
    let selectedBranchInfo: SelectedBranchInfo | null = null;

    if (input?.branchId?.trim()) {
      const requestedBranchId = input.branchId.trim();

      const hasAccess = await checkBranchAccess({
        userId: user.id,
        organizationId,
        branchId: requestedBranchId,
      });

      if (!hasAccess) {
        const branchRecord = await db.branch.findUnique({
          where: { id: requestedBranchId },
          select: { id: true, organizationId: true, isActive: true },
        });

        if (!branchRecord) {
          return { success: false, error: `Branch "${requestedBranchId}" does not exist.` };
        }
        if (branchRecord.organizationId !== organizationId) {
          throw new CrossTenantViolationError(
            `Multi-tenant violation: Branch "${requestedBranchId}" belongs to another organization.`
          );
        }
        return {
          success: false,
          error: `User does not have authorized access to branch "${requestedBranchId}".`,
        };
      }

      const branch = await db.branch.findUnique({
        where: { id: requestedBranchId },
        select: { id: true, name: true, code: true },
      });

      if (branch) {
        selectedBranchInfo = { id: branch.id, name: branch.name, code: branch.code };
      }
      branchFilterClause = requestedBranchId;
    } else {
      // No explicit branchId supplied: resolve based on user role
      if (role === SYSTEM_ROLES.OWNER || role === SYSTEM_ROLES.ACCOUNTANT) {
        // Full organization-wide view across all branches
        branchFilterClause = undefined;
        selectedBranchInfo = null;
      } else {
        // Scoped to caller's assigned active branches
        const authorizedBranchIds = membership.branchMemberships
          .filter((bm) => bm.branch.isActive)
          .map((bm) => bm.branchId);

        if (authorizedBranchIds.length === 0) {
          // User has no active branch assignments: return zero metrics safely
          return {
            success: true,
            data: {
              organizationId,
              organizationName,
              currency,
              timezone,
              dateRange: {
                startDate: null,
                endDate: null,
                preset: input?.datePreset || "today",
              },
              selectedBranch: null,
              accessibleBranches: [],
              userRole: role,
              salesMetrics: role === SYSTEM_ROLES.INVENTORY_MANAGER ? null : {
                grossRevenue: "0.00",
                completedOrderCount: 0,
                averageOrderValue: "0.00",
                totalDiscounts: "0.00",
                totalTax: "0.00",
                subtotal: "0.00",
              },
              returnsMetrics: role === SYSTEM_ROLES.INVENTORY_MANAGER ? null : {
                returnCount: 0,
                totalRefundedAmount: "0.00",
                totalReturnedAmount: "0.00",
              },
              netSalesRevenue: role === SYSTEM_ROLES.INVENTORY_MANAGER ? null : "0.00",
              inventoryMetrics: {
                lowStockCount: 0,
                outOfStockCount: 0,
                totalTrackedItems: 0,
              },
              branchSummaries: [],
              stockAlerts: {
                outOfStockItems: [],
                lowStockItems: [],
                totalOutOfStockCount: 0,
                totalLowStockCount: 0,
                hasMoreOutOfStock: false,
                hasMoreLowStock: false,
              },
              topSellingProducts: role === SYSTEM_ROLES.INVENTORY_MANAGER ? null : [],
              recentActivity: [],
            },
          };
        }

        branchFilterClause = { in: authorizedBranchIds };
        if (authorizedBranchIds.length === 1) {
          const singleBranchId = authorizedBranchIds[0];
          const singleBranch = await db.branch.findUnique({
            where: { id: singleBranchId },
            select: { id: true, name: true, code: true },
          });
          if (singleBranch) {
            selectedBranchInfo = {
              id: singleBranch.id,
              name: singleBranch.name,
              code: singleBranch.code,
            };
          }
        }
      }
    }

    // 2. Resolve reporting date range in business timezone
    const requestedPreset = input?.datePreset || "today";
    const { startDate, endDate, resolvedPreset } = computeDateBounds(
      requestedPreset,
      timezone,
      input?.startDate,
      input?.endDate
    );

    const dateFilterClause =
      startDate && endDate ? { gte: startDate, lte: endDate } : undefined;

    // 3. Build database where clauses
    const salesWhere: Prisma.SaleWhereInput = {
      organizationId,
      status: SaleStatus.COMPLETED, // Strictly completed sales (voided & drafts excluded)
      ...(branchFilterClause !== undefined ? { branchId: branchFilterClause } : {}),
      ...(dateFilterClause !== undefined ? { saleDate: dateFilterClause } : {}),
    };

    const returnsWhere: Prisma.SaleReturnWhereInput = {
      organizationId,
      ...(branchFilterClause !== undefined ? { branchId: branchFilterClause } : {}),
      ...(dateFilterClause !== undefined ? { returnDate: dateFilterClause } : {}),
    };

    const stockWhere: Prisma.InventoryStockWhereInput = {
      organizationId,
      ...(branchFilterClause !== undefined ? { branchId: branchFilterClause } : {}),
      product: { isActive: true }, // Only active catalog items
    };

    // 4. Role-based metric segregation:
    // INVENTORY_MANAGER does NOT receive sales/financial data
    const isInventoryManager = role === SYSTEM_ROLES.INVENTORY_MANAGER;

    // 5. Execute parallel aggregation queries
    const [
      salesAgg,
      returnsAgg,
      outOfStockCount,
      outOfStockCandidates,
      lowStockCandidates,
      totalTrackedItems,
      topSaleItems,
      recentActivityRaw,
      chartDataRaw,
    ] = await Promise.all([
      // Query 1: Sales Aggregate (excluded for INVENTORY_MANAGER)
      isInventoryManager
        ? Promise.resolve(null)
        : db.sale.aggregate({
            where: salesWhere,
            _count: { id: true },
            _sum: {
              totalAmount: true,
              discountAmount: true,
              taxAmount: true,
              subtotal: true,
            },
          }),

      // Query 2: Returns Aggregate (excluded for INVENTORY_MANAGER)
      isInventoryManager
        ? Promise.resolve(null)
        : db.saleReturn.aggregate({
            where: returnsWhere,
            _count: { id: true },
            _sum: {
              totalAmount: true,
              refundedAmount: true,
            },
          }),

      // Query 3: Out of Stock count (quantity <= 0)
      db.inventoryStock.count({
        where: {
          ...stockWhere,
          quantity: { lte: 0 },
        },
      }),

      // Query 4: Out of Stock item details (quantity <= 0)
      db.inventoryStock.findMany({
        where: {
          ...stockWhere,
          quantity: { lte: 0 },
          branch: { isActive: true },
        },
        select: {
          id: true,
          quantity: true,
          reorderLevel: true,
          branchId: true,
          product: { select: { name: true, sku: true, unit: true, isActive: true } },
          variant: { select: { name: true, sku: true, isActive: true } },
          branch: { select: { id: true, name: true, code: true, isActive: true } },
        },
        orderBy: { quantity: "asc" },
        take: 20,
      }),

      // Query 5: Low Stock Candidates (reorderLevel set and quantity > 0)
      db.inventoryStock.findMany({
        where: {
          ...stockWhere,
          reorderLevel: { not: null },
          quantity: { gt: 0 },
          branch: { isActive: true },
        },
        select: {
          id: true,
          quantity: true,
          reorderLevel: true,
          branchId: true,
          product: { select: { name: true, sku: true, unit: true, isActive: true } },
          variant: { select: { name: true, sku: true, isActive: true } },
          branch: { select: { id: true, name: true, code: true, isActive: true } },
        },
        orderBy: { quantity: "asc" },
        take: 100,
      }),

      // Query 6: Total active tracked inventory items
      db.inventoryStock.count({
        where: stockWhere,
      }),

      // Query 7: Top Selling Products (excluded for INVENTORY_MANAGER)
      isInventoryManager
        ? Promise.resolve([])
        : db.saleItem.findMany({
            where: {
              organizationId,
              sale: {
                status: SaleStatus.COMPLETED,
                ...(branchFilterClause !== undefined ? { branchId: branchFilterClause } : {}),
                ...(dateFilterClause !== undefined ? { saleDate: dateFilterClause } : {}),
              },
            },
            select: {
              productId: true,
              variantId: true,
              productName: true,
              productSku: true,
              quantity: true,
              quantityReturned: true,
              lineTotal: true,
              product: { select: { name: true, sku: true } },
              variant: { select: { name: true, sku: true } },
            },
            take: 1000,
          }),

      // Query 8: Recent Activity
      isInventoryManager
        ? db.inventoryMovement.findMany({
            where: {
              organizationId,
              ...(branchFilterClause !== undefined ? { branchId: branchFilterClause } : {}),
            },
            select: {
              id: true,
              movementType: true,
              quantityDelta: true,
              createdAt: true,
              reason: true,
              product: { select: { name: true } },
              branch: { select: { name: true, code: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          })
        : Promise.all([
            db.sale.findMany({
              where: {
                organizationId,
                status: SaleStatus.COMPLETED,
                ...(branchFilterClause !== undefined ? { branchId: branchFilterClause } : {}),
              },
              select: {
                id: true,
                invoiceNumber: true,
                totalAmount: true,
                saleDate: true,
                branch: { select: { name: true, code: true } },
                _count: { select: { items: true } },
              },
              orderBy: { saleDate: "desc" },
              take: 8,
            }),
            db.saleReturn.findMany({
              where: {
                organizationId,
                ...(branchFilterClause !== undefined ? { branchId: branchFilterClause } : {}),
              },
              select: {
                id: true,
                returnNumber: true,
                refundedAmount: true,
                returnDate: true,
                branch: { select: { name: true, code: true } },
                _count: { select: { items: true } },
              },
              orderBy: { returnDate: "desc" },
              take: 5,
            }),
            db.inventoryMovement.findMany({
              where: {
                organizationId,
                ...(branchFilterClause !== undefined ? { branchId: branchFilterClause } : {}),
              },
              select: {
                id: true,
                movementType: true,
                quantityDelta: true,
                createdAt: true,
                reason: true,
                product: { select: { name: true } },
                branch: { select: { name: true, code: true } },
              },
              orderBy: { createdAt: "desc" },
              take: 5,
            }),
          ]),

      // Query 9: Chart Time-Series Data
      isInventoryManager
        ? Promise.resolve({ chartSales: [], chartReturns: [] })
        : Promise.all([
            db.sale.findMany({
              where: salesWhere,
              select: {
                saleDate: true,
                totalAmount: true,
              },
              orderBy: { saleDate: "asc" },
            }),
            db.saleReturn.findMany({
              where: returnsWhere,
              select: {
                returnDate: true,
                refundedAmount: true,
              },
              orderBy: { returnDate: "asc" },
            }),
          ]).then(([chartSales, chartReturns]) => ({ chartSales, chartReturns })),
    ]);

    // 6. Calculate inventory alert counts and item lists
    const lowStockFiltered = lowStockCandidates.filter(
      (item) =>
        item.branch.isActive &&
        item.product.isActive &&
        (!item.variant || item.variant.isActive) &&
        item.reorderLevel !== null &&
        item.quantity.lessThanOrEqualTo(item.reorderLevel)
    );
    const lowStockCount = lowStockFiltered.length;

    const lowStockAlertItems: DashboardStockAlertItem[] = lowStockFiltered.slice(0, 10).map((item) => ({
      id: item.id,
      productName: item.product.name,
      variantName: item.variant?.name || null,
      sku: item.variant?.sku || item.product.sku || null,
      quantity: item.quantity.toFixed(item.product.unit === "piece" ? 0 : 2),
      reorderLevel: item.reorderLevel ? item.reorderLevel.toFixed(item.product.unit === "piece" ? 0 : 2) : null,
      unit: item.product.unit,
      branchId: item.branch.id,
      branchName: item.branch.name,
      branchCode: item.branch.code,
      status: "LOW_STOCK" as const,
    }));

    const outOfStockFiltered = outOfStockCandidates.filter(
      (item) =>
        item.branch.isActive &&
        item.product.isActive &&
        (!item.variant || item.variant.isActive)
    );

    const outOfStockAlertItems: DashboardStockAlertItem[] = outOfStockFiltered.slice(0, 10).map((item) => ({
      id: item.id,
      productName: item.product.name,
      variantName: item.variant?.name || null,
      sku: item.variant?.sku || item.product.sku || null,
      quantity: item.quantity.toFixed(item.product.unit === "piece" ? 0 : 2),
      reorderLevel: item.reorderLevel ? item.reorderLevel.toFixed(item.product.unit === "piece" ? 0 : 2) : null,
      unit: item.product.unit,
      branchId: item.branch.id,
      branchName: item.branch.name,
      branchCode: item.branch.code,
      status: "OUT_OF_STOCK" as const,
    }));

    // 7. Calculate sales & financial figures using Decimal arithmetic
    let salesMetricsDTO = null;
    let returnsMetricsDTO = null;
    let netSalesRevenueStr: string | null = null;

    if (!isInventoryManager && salesAgg && returnsAgg) {
      const grossRevenue = salesAgg._sum.totalAmount ?? new Prisma.Decimal("0.00");
      const totalDiscounts = salesAgg._sum.discountAmount ?? new Prisma.Decimal("0.00");
      const totalTax = salesAgg._sum.taxAmount ?? new Prisma.Decimal("0.00");
      const subtotal = salesAgg._sum.subtotal ?? new Prisma.Decimal("0.00");
      const completedOrderCount = salesAgg._count.id;

      // Average Order Value = grossRevenue / completedOrderCount
      const averageOrderValue =
        completedOrderCount > 0
          ? grossRevenue.dividedBy(completedOrderCount).toFixed(2)
          : "0.00";

      salesMetricsDTO = {
        grossRevenue: grossRevenue.toFixed(2),
        completedOrderCount,
        averageOrderValue,
        totalDiscounts: totalDiscounts.toFixed(2),
        totalTax: totalTax.toFixed(2),
        subtotal: subtotal.toFixed(2),
      };

      const totalRefunded = returnsAgg._sum.refundedAmount ?? new Prisma.Decimal("0.00");
      const totalReturned = returnsAgg._sum.totalAmount ?? new Prisma.Decimal("0.00");
      const returnCount = returnsAgg._count.id;

      returnsMetricsDTO = {
        returnCount,
        totalRefundedAmount: totalRefunded.toFixed(2),
        totalReturnedAmount: totalReturned.toFixed(2),
      };

      // Net Sales Revenue = Gross Revenue - Total Refunded
      netSalesRevenueStr = grossRevenue.minus(totalRefunded).toFixed(2);
    }

    // 8. Top Selling Products calculation
    let topSellingProducts: DashboardTopProductItem[] | null = null;
    if (!isInventoryManager && Array.isArray(topSaleItems)) {
      const productMap = new Map<
        string,
        {
          productId: string;
          variantId: string | null;
          productName: string;
          variantName: string | null;
          sku: string | null;
          unitsSold: Prisma.Decimal;
          unitsReturned: Prisma.Decimal;
          grossRevenue: Prisma.Decimal;
        }
      >();

      for (const item of topSaleItems) {
        const key = item.variantId ? `${item.productId}:${item.variantId}` : item.productId;
        const existing = productMap.get(key);
        if (existing) {
          existing.unitsSold = existing.unitsSold.plus(item.quantity);
          existing.unitsReturned = existing.unitsReturned.plus(item.quantityReturned);
          existing.grossRevenue = existing.grossRevenue.plus(item.lineTotal);
        } else {
          productMap.set(key, {
            productId: item.productId,
            variantId: item.variantId,
            productName: item.variant?.name ? `${item.product.name} (${item.variant.name})` : item.product.name,
            variantName: item.variant?.name || null,
            sku: item.variant?.sku || item.productSku || item.product.sku || null,
            unitsSold: item.quantity,
            unitsReturned: item.quantityReturned,
            grossRevenue: item.lineTotal,
          });
        }
      }

      topSellingProducts = Array.from(productMap.values())
        .sort((a, b) => b.unitsSold.minus(a.unitsSold).toNumber())
        .slice(0, 5)
        .map((p) => {
          const netSold = p.unitsSold.minus(p.unitsReturned);
          return {
            productId: p.productId,
            variantId: p.variantId,
            productName: p.productName,
            variantName: p.variantName,
            sku: p.sku,
            unitsSold: Math.round(p.unitsSold.toNumber()),
            unitsReturned: Math.round(p.unitsReturned.toNumber()),
            netUnitsSold: Math.max(0, Math.round(netSold.toNumber())),
            grossRevenue: p.grossRevenue.toFixed(2),
          };
        });
    }

    // 9. Recent Activity formatting
    let recentActivity: DashboardActivityItem[] = [];
    if (isInventoryManager) {
      const movements = recentActivityRaw as Array<{
        id: string;
        movementType: string;
        quantityDelta: Prisma.Decimal;
        createdAt: Date;
        reason: string | null;
        product: { name: string };
        branch: { name: string; code: string };
      }>;
      recentActivity = movements.map((m) => ({
        id: m.id,
        type: "INVENTORY_MOVEMENT" as const,
        title: `Stock Adjustment: ${m.product.name}`,
        description: `${m.quantityDelta.greaterThan(0) ? "+" : ""}${m.quantityDelta.toFixed(0)} units • Type: ${m.movementType}${m.reason ? ` • ${m.reason}` : ""}`,
        timestamp: m.createdAt.toISOString(),
        branchName: m.branch.name,
        branchCode: m.branch.code,
        amount: null,
      }));
    } else {
      const [sales, returns, movements] = recentActivityRaw as [
        Array<{
          id: string;
          invoiceNumber: string;
          totalAmount: Prisma.Decimal;
          saleDate: Date;
          branch: { name: string; code: string };
          _count: { items: number };
        }>,
        Array<{
          id: string;
          returnNumber: string;
          refundedAmount: Prisma.Decimal;
          returnDate: Date;
          branch: { name: string; code: string };
          _count: { items: number };
        }>,
        Array<{
          id: string;
          movementType: string;
          quantityDelta: Prisma.Decimal;
          createdAt: Date;
          reason: string | null;
          product: { name: string };
          branch: { name: string; code: string };
        }>
      ];

      const events: DashboardActivityItem[] = [
        ...sales.map((s) => ({
          id: s.id,
          type: "SALE" as const,
          title: `Sale #${s.invoiceNumber} Completed`,
          description: `${s._count.items} item${s._count.items === 1 ? "" : "s"} fulfilled`,
          timestamp: s.saleDate.toISOString(),
          branchName: s.branch.name,
          branchCode: s.branch.code,
          amount: s.totalAmount.toFixed(2),
        })),
        ...returns.map((r) => ({
          id: r.id,
          type: "SALE_RETURN" as const,
          title: `Return #${r.returnNumber} Processed`,
          description: `${r._count.items} item${r._count.items === 1 ? "" : "s"} returned`,
          timestamp: r.returnDate.toISOString(),
          branchName: r.branch.name,
          branchCode: r.branch.code,
          amount: r.refundedAmount.toFixed(2),
        })),
        ...movements.map((m) => ({
          id: m.id,
          type: "INVENTORY_MOVEMENT" as const,
          title: `Stock Movement: ${m.product.name}`,
          description: `${m.quantityDelta.greaterThan(0) ? "+" : ""}${m.quantityDelta.toFixed(0)} units • ${m.movementType}`,
          timestamp: m.createdAt.toISOString(),
          branchName: m.branch.name,
          branchCode: m.branch.code,
          amount: null,
        })),
      ];

      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      recentActivity = events.slice(0, 10);
    }

    // 10. Branch summaries for multi-branch view (OWNER, ACCOUNTANT, or multi-branch MANAGER)
    let branchSummaries: DashboardBranchSummary[] = [];

    const canViewMultiBranch =
      role === SYSTEM_ROLES.OWNER ||
      role === SYSTEM_ROLES.ACCOUNTANT ||
      (membership.branchMemberships.length > 1 && role === SYSTEM_ROLES.MANAGER);

    if (canViewMultiBranch && !selectedBranchInfo) {
      const branchIdsToQuery =
        role === SYSTEM_ROLES.OWNER || role === SYSTEM_ROLES.ACCOUNTANT
          ? undefined
          : membership.branchMemberships
              .filter((bm) => bm.branch.isActive)
              .map((bm) => bm.branchId);

      const activeBranches = await db.branch.findMany({
        where: {
          organizationId,
          isActive: true,
          ...(branchIdsToQuery ? { id: { in: branchIdsToQuery } } : {}),
        },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      });

      if (activeBranches.length > 0) {
        const branchIds = activeBranches.map((b) => b.id);

        const [branchSalesAgg, branchStockAgg, branchReturnsAgg] = await Promise.all([
          isInventoryManager
            ? Promise.resolve([])
            : db.sale.groupBy({
                by: ["branchId"],
                where: {
                  organizationId,
                  branchId: { in: branchIds },
                  status: SaleStatus.COMPLETED,
                  ...(dateFilterClause !== undefined ? { saleDate: dateFilterClause } : {}),
                },
                _sum: { totalAmount: true },
                _count: { id: true },
              }),

          db.inventoryStock.findMany({
            where: {
              organizationId,
              branchId: { in: branchIds },
              reorderLevel: { not: null },
              product: { isActive: true },
            },
            select: {
              branchId: true,
              quantity: true,
              reorderLevel: true,
            },
          }),

          isInventoryManager
            ? Promise.resolve([])
            : db.saleReturn.groupBy({
                by: ["branchId"],
                where: {
                  organizationId,
                  branchId: { in: branchIds },
                  ...(dateFilterClause !== undefined ? { returnDate: dateFilterClause } : {}),
                },
                _sum: { refundedAmount: true },
              }),
        ]);

        const salesByBranch = new Map<string, { revenue: string; count: number }>();
        for (const item of branchSalesAgg) {
          salesByBranch.set(item.branchId, {
            revenue: (item._sum.totalAmount ?? new Prisma.Decimal("0.00")).toFixed(2),
            count: item._count.id,
          });
        }

        const refundsByBranch = new Map<string, Prisma.Decimal>();
        for (const item of branchReturnsAgg) {
          refundsByBranch.set(item.branchId, item._sum.refundedAmount ?? new Prisma.Decimal("0.00"));
        }

        const lowStockByBranch = new Map<string, number>();
        for (const item of branchStockAgg) {
          if (
            item.reorderLevel !== null &&
            item.quantity.greaterThan(0) &&
            item.quantity.lessThanOrEqualTo(item.reorderLevel)
          ) {
            lowStockByBranch.set(item.branchId, (lowStockByBranch.get(item.branchId) || 0) + 1);
          }
        }

        branchSummaries = activeBranches.map((b) => {
          const s = salesByBranch.get(b.id);
          const grossDec = s ? new Prisma.Decimal(s.revenue) : new Prisma.Decimal("0.00");
          const refundDec = refundsByBranch.get(b.id) ?? new Prisma.Decimal("0.00");
          const netDec = grossDec.minus(refundDec);
          const netRevenue = netDec.greaterThan(0) ? netDec.toFixed(2) : "0.00";

          return {
            id: b.id,
            name: b.name,
            code: b.code,
            grossRevenue: isInventoryManager ? undefined : (s?.revenue ?? "0.00"),
            netSalesRevenue: isInventoryManager ? undefined : netRevenue,
            completedOrderCount: isInventoryManager ? undefined : (s?.count ?? 0),
            lowStockCount: lowStockByBranch.get(b.id) || 0,
          };
        });
      }
    }

    const revenueTimeSeries = isInventoryManager
      ? null
      : generateRevenueTimeSeries({
          sales: chartDataRaw.chartSales,
          returns: chartDataRaw.chartReturns,
          startDate,
          endDate,
          preset: resolvedPreset,
          timezone,
        });

    const payload: DashboardMetricsDTO = {
      organizationId,
      organizationName,
      currency,
      timezone,
      dateRange: {
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate ? endDate.toISOString() : null,
        preset: resolvedPreset,
      },
      selectedBranch: selectedBranchInfo,
      accessibleBranches,
      userRole: role,
      salesMetrics: salesMetricsDTO,
      returnsMetrics: returnsMetricsDTO,
      netSalesRevenue: netSalesRevenueStr,
      revenueTimeSeries,
      inventoryMetrics: {
        lowStockCount,
        outOfStockCount,
        totalTrackedItems,
      },
      branchSummaries,
      stockAlerts: {
        outOfStockItems: outOfStockAlertItems,
        lowStockItems: lowStockAlertItems,
        totalOutOfStockCount: outOfStockCount,
        totalLowStockCount: lowStockCount,
        hasMoreOutOfStock: outOfStockCount > outOfStockAlertItems.length,
        hasMoreLowStock: lowStockCount > lowStockAlertItems.length,
      },
      topSellingProducts,
      recentActivity,
    };

    return {
      success: true,
      data: payload,
    };
  } catch (err: unknown) {
    if (err instanceof TenantContextError) {
      if (err.code === "MULTIPLE_ORGS_SPECIFY_REQUIRED") {
        return {
          success: false,
          error: "Multiple organizations found. Please specify an organization context.",
        };
      }
      if (err.code === "NO_ACTIVE_MEMBERSHIP") {
        return {
          success: false,
          error: "No active organization membership found for your account.",
        };
      }
      if (err.code === "MEMBERSHIP_NOT_FOUND") {
        return {
          success: false,
          error: "The requested organization was not found or you do not have an active membership in it.",
        };
      }
      if (err.code === "INACTIVE_MEMBERSHIP") {
        return {
          success: false,
          error: "Your membership in the requested organization is inactive or disabled.",
        };
      }
      if (err.code === "UNAUTHORIZED_ROLE" || err.code === "OWNER_ROLE_REQUIRED") {
        return {
          success: false,
          error: "Permission denied: Your role does not have access to dashboard metrics.",
        };
      }
      if (err.code === "AUTH_REQUIRED") {
        return {
          success: false,
          error: "Unauthorized: Authentication required.",
        };
      }
      return { success: false, error: err.message };
    }

    if (
      err instanceof MembershipsUnauthorizedRoleError ||
      err instanceof MembershipsNotFoundError ||
      err instanceof CrossTenantViolationError ||
      err instanceof BranchNotFoundError
    ) {
      return { success: false, error: err.message };
    }

    console.error("[getDashboardMetricsAction Error]:", err);
    return {
      success: false,
      error: "An unexpected error occurred while loading dashboard metrics. Please try again.",
    };
  }
}
