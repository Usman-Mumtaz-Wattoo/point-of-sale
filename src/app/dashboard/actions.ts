"use server";

import { Prisma, SaleStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentAppUser } from "@/lib/auth";
import { SYSTEM_ROLES, type SystemRoleName } from "@/lib/roles";
import {
  checkBranchAccess,
  CrossTenantViolationError,
  MembershipNotFoundError,
  UnauthorizedRoleError,
  BranchNotFoundError,
} from "@/lib/memberships";
import type { AppUserContext } from "@/lib/sales";
import type {
  GetDashboardMetricsInput,
  DashboardMetricsDTO,
  DashboardActionResult,
  DashboardDatePreset,
  DashboardBranchSummary,
  SelectedBranchInfo,
} from "./types";

export type {
  GetDashboardMetricsInput,
  DashboardMetricsDTO,
  DashboardActionResult,
  DashboardDatePreset,
  DashboardBranchSummary,
  SelectedBranchInfo,
};

export const DASHBOARD_ALLOWED_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.CASHIER,
  SYSTEM_ROLES.ACCOUNTANT,
  SYSTEM_ROLES.INVENTORY_MANAGER,
];

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
 * Validates the caller's server-side session and active organization membership.
 * Enforces strict multi-tenant boundaries and role authorization.
 */
async function verifyDashboardContext(
  requestedOrgId?: string,
  options?: DashboardServiceOptions
): Promise<VerifiedDashboardContext> {
  const user = options?.actorUser !== undefined ? options.actorUser : await getCurrentAppUser();
  if (!user) {
    throw new Error("Unauthorized: Authentication required.");
  }

  const candidateOrgId = requestedOrgId?.trim() || options?.organizationId?.trim() || undefined;

  const membership = candidateOrgId
    ? user.memberships.find((m) => m.organizationId === candidateOrgId && m.isActive)
    : user.memberships.find((m) => m.isActive);

  if (!membership) {
    throw new MembershipNotFoundError(
      candidateOrgId
        ? `User has no active membership in organization "${candidateOrgId}".`
        : "User does not belong to any active organization."
    );
  }

  const roleName = membership.role.name as SystemRoleName;

  if (!DASHBOARD_ALLOWED_ROLES.includes(roleName)) {
    throw new UnauthorizedRoleError(
      `Role "${roleName}" is not permitted to access dashboard metrics.`
    );
  }

  // Fetch organization settings (currency, timezone, name)
  const org = await db.organization.findUnique({
    where: { id: membership.organizationId },
    select: {
      id: true,
      name: true,
      currency: true,
      timezone: true,
    },
  });

  if (!org) {
    throw new MembershipNotFoundError("Organization does not exist.");
  }

  return {
    user,
    organizationId: org.id,
    organizationName: org.name,
    currency: org.currency || "USD",
    timezone: org.timezone || "UTC",
    role: roleName,
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

  if (preset === "thisMonth") {
    const start = getUtcDateForTimezone(currYear, currMonth, 1, 0, 0, 0, 0, timeZone);
    const end = getUtcDateForTimezone(currYear, currMonth, currDay, 23, 59, 59, 999, timeZone);
    return { startDate: start, endDate: end, resolvedPreset: "thisMonth" };
  }

  // Default: "today"
  const start = getUtcDateForTimezone(currYear, currMonth, currDay, 0, 0, 0, 0, timeZone);
  const end = getUtcDateForTimezone(currYear, currMonth, currDay, 23, 59, 59, 999, timeZone);
  return { startDate: start, endDate: end, resolvedPreset: "today" };
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

    // 1. Resolve branch scoping & validate branch permissions
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
      lowStockCandidates,
      totalTrackedItems,
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

      // Query 4: Low Stock Candidates (reorderLevel set and quantity > 0)
      db.inventoryStock.findMany({
        where: {
          ...stockWhere,
          reorderLevel: { not: null },
          quantity: { gt: 0 },
        },
        select: {
          quantity: true,
          reorderLevel: true,
        },
      }),

      // Query 5: Total active tracked inventory items
      db.inventoryStock.count({
        where: stockWhere,
      }),
    ]);

    // 6. Calculate inventory alert counts
    let lowStockCount = 0;
    for (const item of lowStockCandidates) {
      if (item.reorderLevel !== null && item.quantity.lessThanOrEqualTo(item.reorderLevel)) {
        lowStockCount++;
      }
    }

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

    // 8. Branch summaries for multi-branch view (OWNER, ACCOUNTANT, or multi-branch MANAGER)
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

        const [branchSalesAgg, branchStockAgg] = await Promise.all([
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
        ]);

        const salesByBranch = new Map<string, { revenue: string; count: number }>();
        for (const item of branchSalesAgg) {
          salesByBranch.set(item.branchId, {
            revenue: (item._sum.totalAmount ?? new Prisma.Decimal("0.00")).toFixed(2),
            count: item._count.id,
          });
        }

        const lowStockByBranch = new Map<string, number>();
        for (const item of branchStockAgg) {
          if (item.reorderLevel !== null && item.quantity.lessThanOrEqualTo(item.reorderLevel)) {
            lowStockByBranch.set(item.branchId, (lowStockByBranch.get(item.branchId) || 0) + 1);
          }
        }

        branchSummaries = activeBranches.map((b) => {
          const s = salesByBranch.get(b.id);
          return {
            id: b.id,
            name: b.name,
            code: b.code,
            grossRevenue: s?.revenue ?? "0.00",
            completedOrderCount: s?.count ?? 0,
            lowStockCount: lowStockByBranch.get(b.id) || 0,
          };
        });
      }
    }

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
      userRole: role,
      salesMetrics: salesMetricsDTO,
      returnsMetrics: returnsMetricsDTO,
      netSalesRevenue: netSalesRevenueStr,
      inventoryMetrics: {
        lowStockCount,
        outOfStockCount,
        totalTrackedItems,
      },
      branchSummaries,
    };

    return {
      success: true,
      data: payload,
    };
  } catch (err: unknown) {
    if (
      err instanceof UnauthorizedRoleError ||
      err instanceof MembershipNotFoundError ||
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
