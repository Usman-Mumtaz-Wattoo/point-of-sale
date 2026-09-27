/**
 * Shared types, interfaces, and enums for Sales Returns & Refunds.
 * Separated from actions.ts to ensure Next.js "use server" actions export only async functions
 * and client components avoid direct Prisma runtime imports.
 */

export const SalePaymentMethod = {
  CASH: "CASH",
  CARD: "CARD",
  BANK_TRANSFER: "BANK_TRANSFER",
  DIGITAL_WALLET: "DIGITAL_WALLET",
  OTHER: "OTHER",
} as const;

export type SalePaymentMethod = (typeof SalePaymentMethod)[keyof typeof SalePaymentMethod];

export interface SerializedReturnableItem {
  saleItemId: string;
  productId: string;
  variantId: string | null;
  productName: string;
  productSku: string | null;
  quantitySold: string;
  quantityAlreadyReturned: string;
  quantityReturnable: string;
  unitPrice: string;
  unitCost: string;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
  totalRefundableAmount: string;
  amountAlreadyReturned: string;
  amountRemainingRefundable: string;
}

export interface SerializedReturnableInfo {
  saleId: string;
  invoiceNumber: string;
  saleDate: string;
  status: string;
  paymentStatus: string;
  totalAmount: string;
  paidAmount: string;
  totalRefundedAmount: string;
  remainingRefundCeiling: string;
  isEligibleForReturn: boolean;
  ineligibilityReason: string | null;
  branch: {
    id: string;
    name: string;
    code: string;
  };
  customer: {
    id: string;
    name: string;
    code: string | null;
    phone: string | null;
  } | null;
  cashier: {
    id: string;
    name: string;
  } | null;
  items: SerializedReturnableItem[];
}

export interface SerializedReturnItemDetail {
  id: string;
  saleItemId: string;
  productId: string;
  variantId: string | null;
  productName: string;
  productSku: string | null;
  quantityReturned: string;
  unitPrice: string;
  unitCost: string;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  subtotal: string;
  lineTotal: string;
  reason: string | null;
}

export interface SerializedRefundDetail {
  id: string;
  refundNumber: string;
  amount: string;
  paymentMethod: SalePaymentMethod;
  reference: string | null;
  notes: string | null;
  refundedAt: string;
  processedBy: {
    id: string;
    name: string;
    email: string;
  };
}

export interface SerializedSaleReturnDetail {
  id: string;
  returnNumber: string;
  organizationId: string;
  branchId: string;
  saleId: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  refundedAmount: string;
  reason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  sale: {
    id: string;
    invoiceNumber: string;
    saleDate: string;
    totalAmount: string;
    paidAmount: string;
    customerId: string | null;
    customer: {
      id: string;
      name: string;
      code: string | null;
      phone: string | null;
    } | null;
  };
  branch: {
    id: string;
    name: string;
    code: string;
  };
  returnedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  items: SerializedReturnItemDetail[];
  refunds: SerializedRefundDetail[];
}

export interface SerializedPaginatedReturns {
  items: SerializedSaleReturnDetail[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ReturnActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface SubmitReturnItemInput {
  saleItemId: string;
  quantityReturned: string | number;
  reason?: string | null;
}

export interface SubmitReturnInput {
  saleId: string;
  items: SubmitReturnItemInput[];
  refund: {
    paymentMethod: SalePaymentMethod;
    reference?: string | null;
    notes?: string | null;
  };
  idempotencyKey?: string | null;
  reason?: string | null;
  notes?: string | null;
}

export interface ListReturnsActionParams {
  branchId?: string;
  saleId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}
