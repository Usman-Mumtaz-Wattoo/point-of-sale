/**
 * Shared client-safe types, interfaces, and DTOs for Sales Management & Voiding.
 * Separated from actions.ts to ensure Next.js "use server" actions export only async functions
 * and client components avoid direct Prisma runtime imports.
 */

export const SaleStatus = {
  DRAFT: "DRAFT",
  COMPLETED: "COMPLETED",
  VOIDED: "VOIDED",
} as const;
export type SaleStatus = (typeof SaleStatus)[keyof typeof SaleStatus];

export const SalePaymentStatus = {
  UNPAID: "UNPAID",
  PARTIAL: "PARTIAL",
  PAID: "PAID",
} as const;
export type SalePaymentStatus = (typeof SalePaymentStatus)[keyof typeof SalePaymentStatus];

export const SalePaymentMethod = {
  CASH: "CASH",
  CARD: "CARD",
  BANK_TRANSFER: "BANK_TRANSFER",
  DIGITAL_WALLET: "DIGITAL_WALLET",
  OTHER: "OTHER",
} as const;
export type SalePaymentMethod = (typeof SalePaymentMethod)[keyof typeof SalePaymentMethod];

export interface SerializedSaleBranch {
  id: string;
  name: string;
  code: string;
}

export interface SerializedSaleCashier {
  id: string;
  name: string;
  email: string;
}

export interface SerializedSaleCustomer {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  email?: string | null;
}

export interface SerializedSaleKPISummary {
  totalSalesCount: number;
  totalCompletedRevenue: string;
  totalDiscountAmount: string;
  totalTaxAmount: string;
}

export interface SerializedSaleSummary {
  id: string;
  invoiceNumber: string;
  receiptNumber: string | null;
  saleDate: string; // ISO-8601 string
  status: SaleStatus;
  paymentStatus: SalePaymentStatus;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  changeAmount: string;
  customerId: string | null;
  customer?: SerializedSaleCustomer | null;
  createdAt: string; // ISO-8601 string
  branch: SerializedSaleBranch;
  cashier: SerializedSaleCashier | null;
  itemCount: number;
}

export interface SerializedPaginatedSales {
  items: SerializedSaleSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  kpiSummary?: SerializedSaleKPISummary;
}

export interface SerializedSaleDetailItem {
  id: string;
  productId: string;
  variantId: string | null;
  productName: string;
  productSku: string | null;
  quantity: string;
  unitPrice: string;
  unitCost: string;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  subtotal: string;
  lineTotal: string;
  quantityReturned?: string;
  amountReturned?: string;
}

export interface SerializedSaleDetailPayment {
  id: string;
  paymentMethod: SalePaymentMethod;
  amount: string;
  tenderedAmount: string | null;
  changeAmount: string | null;
  reference: string | null;
  notes: string | null;
  paidAt: string; // ISO-8601 string
  recordedBy: SerializedSaleCashier | null;
}

export interface SerializedSaleReturnSummary {
  id: string;
  returnNumber: string;
  totalAmount: string;
  refundedAmount: string;
  reason: string | null;
  createdAt: string; // ISO-8601 string
  returnedBy: SerializedSaleCashier | null;
}

export interface SerializedSaleDetail {
  id: string;
  organizationId: string;
  branchId: string;
  invoiceNumber: string;
  receiptNumber: string | null;
  status: SaleStatus;
  paymentStatus: SalePaymentStatus;
  saleDate: string; // ISO-8601 string
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  changeAmount: string;
  notes: string | null;
  cashierId: string | null;
  customerId: string | null;
  createdAt: string; // ISO-8601 string
  updatedAt: string; // ISO-8601 string
  branch: SerializedSaleBranch;
  cashier: SerializedSaleCashier | null;
  customer?: SerializedSaleCustomer | null;
  items: SerializedSaleDetailItem[];
  payments: SerializedSaleDetailPayment[];
  returns?: SerializedSaleReturnSummary[];
  hasReturns: boolean;
}

export interface SerializedVoidSaleResult {
  saleId: string;
  invoiceNumber: string;
  previousStatus: SaleStatus;
  status: SaleStatus;
  restoredItemCount: number;
  restoredQuantity: string;
  voidedAt: string; // ISO-8601 string
  reason?: string | null;
}

export interface SaleActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ListSalesActionParams {
  branchId?: string;
  status?: SaleStatus;
  paymentStatus?: SalePaymentStatus;
  cashierId?: string;
  customerId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface VoidSaleActionInput {
  saleId: string;
  reason?: string;
}
