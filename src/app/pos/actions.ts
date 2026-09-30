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
  TenantContextError,
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
    if (err instanceof TenantContextError) {
      if (err.code === "MULTIPLE_ORGS_SPECIFY_REQUIRED") {
        return { error: "Multiple organizations found. Please specify an organization context." };
      }
      if (err.code === "NO_ACTIVE_MEMBERSHIP") {
        return { error: "No active organization membership found for your account." };
      }
      if (err.code === "MEMBERSHIP_NOT_FOUND") {
        return { error: "The requested organization was not found or you do not have an active membership in it." };
      }
      if (err.code === "INACTIVE_MEMBERSHIP") {
        return { error: "Your membership in the requested organization is inactive or disabled." };
      }
      if (err.code === "UNAUTHORIZED_ROLE") {
        return { error: "Permission denied: Your role does not have permission to perform sales checkouts." };
      }
      if (err.code === "AUTH_REQUIRED") {
        return { error: "Unauthorized: Authentication required." };
      }
      return { error: err.message };
    }

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
