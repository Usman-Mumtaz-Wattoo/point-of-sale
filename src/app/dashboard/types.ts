/**
 * Shared client-safe types, interfaces, and DTOs for the Executive Business Dashboard.
 * Separated from actions.ts to ensure Next.js "use server" actions export only async functions
 * and client components avoid direct Prisma runtime imports.
 */

import { SYSTEM_ROLES, type SystemRoleName } from "@/lib/roles";

export const DASHBOARD_ALLOWED_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.CASHIER,
  SYSTEM_ROLES.ACCOUNTANT,
  SYSTEM_ROLES.INVENTORY_MANAGER,
];

export type DashboardDatePreset =
  | "today"
  | "yesterday"
  | "last7days"
  | "last30days"
  | "thisMonth"
  | "lastMonth"
  | "all"
  | "custom";

export interface DashboardDateRange {
  startDate: string | null; // ISO-8601 string or null for all-time
  endDate: string | null; // ISO-8601 string or null for all-time
  preset: DashboardDatePreset;
}

export interface DashboardSalesMetrics {
  grossRevenue: string; // Decimal serialized as string (e.g. "1250.00")
  completedOrderCount: number;
  averageOrderValue: string; // grossRevenue / completedOrderCount
  totalDiscounts: string;
  totalTax: string;
  subtotal: string;
}

export interface DashboardReturnsMetrics {
  returnCount: number;
  totalRefundedAmount: string; // Decimal serialized as string
  totalReturnedAmount: string; // Decimal serialized as string
}

export interface DashboardInventoryMetrics {
  lowStockCount: number; // Items where quantity > 0 and quantity <= reorderLevel
  outOfStockCount: number; // Items where quantity <= 0
  totalTrackedItems: number; // Total active stock records
}

export interface DashboardBranchSummary {
  id: string;
  name: string;
  code: string;
  grossRevenue?: string;
  completedOrderCount?: number;
  lowStockCount?: number;
}

export interface SelectedBranchInfo {
  id: string;
  name: string;
  code: string;
}

export interface DashboardMetricsDTO {
  organizationId: string;
  organizationName: string;
  currency: string;
  timezone: string;
  dateRange: DashboardDateRange;
  selectedBranch: SelectedBranchInfo | null; // null represents all authorized branches
  accessibleBranches: SelectedBranchInfo[]; // Authorized branches for branch selector
  userRole: SystemRoleName;
  salesMetrics: DashboardSalesMetrics | null; // null for INVENTORY_MANAGER
  returnsMetrics: DashboardReturnsMetrics | null; // null for INVENTORY_MANAGER
  netSalesRevenue: string | null; // grossRevenue - totalRefundedAmount (null for INVENTORY_MANAGER)
  inventoryMetrics: DashboardInventoryMetrics;
  branchSummaries?: DashboardBranchSummary[]; // Multi-branch comparison for authorized roles
}

export interface GetDashboardMetricsInput {
  branchId?: string;
  datePreset?: DashboardDatePreset;
  startDate?: string; // ISO string or YYYY-MM-DD
  endDate?: string; // ISO string or YYYY-MM-DD
}

export interface DashboardActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
