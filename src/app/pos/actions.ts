"use server";

import {
  completeSale,
  CompleteSaleInput,
  SaleServiceOptions,
  SaleValidationError,
  SaleCustomerInactiveError,
  SaleBranchAccessError,
  SalePaymentError,
  CustomerNotFoundError,
  InsufficientStockError,
  UnauthorizedRoleError,
  MembershipNotFoundError,
  CrossTenantViolationError,
} from "@/lib/sales";

export interface CheckoutActionResult {
  success?: boolean;
  error?: string;
  invoiceNumber?: string;
  saleId?: string;
  totalAmount?: string;
  customerId?: string | null;
}

export async function checkoutSaleAction(
  input: CompleteSaleInput,
  organizationId?: string,
  options?: SaleServiceOptions
): Promise<CheckoutActionResult> {
  try {
    const sale = await completeSale(input, {
      ...options,
      organizationId: options?.organizationId || organizationId,
    });

    return {
      success: true,
      saleId: sale.id,
      invoiceNumber: sale.invoiceNumber,
      totalAmount: sale.totalAmount.toString(),
      customerId: sale.customerId,
    };
  } catch (err: unknown) {
    if (
      err instanceof SaleValidationError ||
      err instanceof SaleCustomerInactiveError ||
      err instanceof SaleBranchAccessError ||
      err instanceof SalePaymentError ||
      err instanceof CustomerNotFoundError ||
      err instanceof InsufficientStockError ||
      err instanceof UnauthorizedRoleError ||
      err instanceof MembershipNotFoundError ||
      err instanceof CrossTenantViolationError
    ) {
      return { error: err.message };
    }

    if (err instanceof Error) {
      return { error: err.message };
    }

    return { error: "An unexpected error occurred during sale checkout." };
  }
}
