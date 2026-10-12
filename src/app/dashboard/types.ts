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
  netSalesRevenue?: string;
  completedOrderCount?: number;
  lowStockCount?: number;
}

export interface SelectedBranchInfo {
  id: string;
  name: string;
  code: string;
}

export interface DashboardStockAlertItem {
  id: string;
  productName: string;
  variantName: string | null;
  sku: string | null;
  quantity: string;
  reorderLevel: string | null;
  unit: string;
  branchId: string;
  branchName: string;
  branchCode: string;
  status: "OUT_OF_STOCK" | "LOW_STOCK";
}

export interface DashboardStockAlertsDTO {
  outOfStockItems: DashboardStockAlertItem[];
  lowStockItems: DashboardStockAlertItem[];
  totalOutOfStockCount: number;
  totalLowStockCount: number;
  hasMoreOutOfStock: boolean;
  hasMoreLowStock: boolean;
}

export interface DashboardTopProductItem {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  sku: string | null;
  unitsSold: number;
  unitsReturned: number;
  netUnitsSold: number;
  grossRevenue: string;
}

export interface DashboardActivityItem {
  id: string;
  type: "SALE" | "SALE_RETURN" | "INVENTORY_MOVEMENT";
  title: string;
  description: string;
  timestamp: string;
  branchName: string;
  branchCode: string;
  amount: string | null;
}

export interface DashboardTimeSeriesPoint {
  date: string;
  label: string;
  netRevenue: string;
  grossRevenue: string;
  refundAmount: string;
  orderCount: number;
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
  revenueTimeSeries?: DashboardTimeSeriesPoint[] | null; // Data-driven time-series for chart
  inventoryMetrics: DashboardInventoryMetrics;
  branchSummaries?: DashboardBranchSummary[]; // Multi-branch comparison for authorized roles
  stockAlerts: DashboardStockAlertsDTO;
  topSellingProducts: DashboardTopProductItem[] | null; // null for INVENTORY_MANAGER
  recentActivity: DashboardActivityItem[];
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
