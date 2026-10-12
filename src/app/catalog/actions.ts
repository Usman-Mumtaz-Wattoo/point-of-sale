"use server";

import { revalidatePath } from "next/cache";
import {
  createCategory,
  createProduct,
  updateProduct,
  createProductVariant,
  CatalogValidationError,
  ProductNotFoundError,
  CategoryNotFoundError,
  VariantNotFoundError,
  CrossTenantViolationError,
  TenantContextError,
} from "@/lib/catalog";
import type { TenantUserContext } from "@/lib/tenant-context";

export interface CatalogActionResult {
  error?: string;
  success?: boolean;
  message?: string;
}

export interface CatalogActionOptions {
  actorUser?: TenantUserContext | null;
}

function formatCatalogActionError(err: unknown, fallbackMessage: string): string {
  if (err instanceof TenantContextError) {
    if (err.code === "MULTIPLE_ORGS_SPECIFY_REQUIRED") {
      return "Multiple organizations found. Please select an organization to proceed.";
    }
    if (err.code === "NO_ACTIVE_MEMBERSHIP") {
      return "No active organization membership found for your account.";
    }
    if (err.code === "MEMBERSHIP_NOT_FOUND") {
      return "The requested organization was not found or you do not have an active membership in it.";
    }
    if (err.code === "INACTIVE_MEMBERSHIP") {
      return "Your membership in the requested organization is inactive or disabled.";
    }
    if (err.code === "UNAUTHORIZED_ROLE") {
      return "Your role does not have permission to modify the product catalog.";
    }
    if (err.code === "AUTH_REQUIRED") {
      return "Authentication required. Please sign in.";
    }
    return err.message;
  }

  if (
    err instanceof CatalogValidationError ||
    err instanceof ProductNotFoundError ||
    err instanceof CategoryNotFoundError ||
    err instanceof VariantNotFoundError ||
    err instanceof CrossTenantViolationError
  ) {
    return err.message;
  }

  if (err instanceof Error) {
    if (
      err.message.startsWith("Unauthorized:") ||
      err.message.startsWith("Multi-tenant violation:") ||
      err.message.includes("does not exist in this organization")
    ) {
      return err.message;
    }
  }

  return fallbackMessage;
}

export async function createCategoryAction(
  _prevState: CatalogActionResult | null,
  formData: FormData,
  options?: CatalogActionOptions
): Promise<CatalogActionResult> {
  const name = formData.get("name")?.toString() || "";
  const description = formData.get("description")?.toString() || undefined;
  const organizationId = formData.get("organizationId")?.toString() || undefined;

  try {
    await createCategory({
      organizationId,
      name,
      description,
      actorUser: options?.actorUser,
    });
    revalidatePath("/catalog");
    return { success: true, message: `Category "${name}" created successfully.` };
  } catch (err: unknown) {
    return { error: formatCatalogActionError(err, "Failed to create category.") };
  }
}

export async function createProductAction(
  _prevState: CatalogActionResult | null,
  formData: FormData,
  options?: CatalogActionOptions
): Promise<CatalogActionResult> {
  const organizationId = formData.get("organizationId")?.toString() || undefined;
  const categoryId = formData.get("categoryId")?.toString() || null;
  const name = formData.get("name")?.toString() || "";
  const description = formData.get("description")?.toString() || null;
  const sku = formData.get("sku")?.toString() || "";
  const barcode = formData.get("barcode")?.toString() || null;
  const brand = formData.get("brand")?.toString() || null;
  const unit = formData.get("unit")?.toString() || "piece";
  const costPrice = formData.get("costPrice")?.toString() || "0";
  const sellingPrice = formData.get("sellingPrice")?.toString() || "0";

  try {
    await createProduct({
      organizationId,
      categoryId: categoryId === "" ? null : categoryId,
      name,
      description,
      sku,
      barcode: barcode === "" ? null : barcode,
      brand,
      unit,
      costPrice,
      sellingPrice,
      actorUser: options?.actorUser,
    });
    revalidatePath("/catalog");
    return { success: true, message: `Product "${name}" created successfully.` };
  } catch (err: unknown) {
    return { error: formatCatalogActionError(err, "Failed to create product.") };
  }
}

export async function updateProductAction(
  _prevState: CatalogActionResult | null,
  formData: FormData,
  options?: CatalogActionOptions
): Promise<CatalogActionResult> {
  const productId = formData.get("productId")?.toString() || "";
  const organizationId = formData.get("organizationId")?.toString() || undefined;
  const categoryId = formData.get("categoryId")?.toString();
  const name = formData.get("name")?.toString();
  const description = formData.get("description")?.toString();
  const sku = formData.get("sku")?.toString();
  const barcode = formData.get("barcode")?.toString();
  const brand = formData.get("brand")?.toString();
  const unit = formData.get("unit")?.toString();
  const costPrice = formData.get("costPrice")?.toString();
  const sellingPrice = formData.get("sellingPrice")?.toString();
  const isActive = formData.get("isActive") !== null ? formData.get("isActive") === "true" : undefined;

  try {
    await updateProduct({
      organizationId,
      productId,
      categoryId: categoryId === "" ? null : categoryId,
      name,
      description,
      sku,
      barcode: barcode === "" ? null : barcode,
      brand,
      unit,
      costPrice,
      sellingPrice,
      isActive,
      actorUser: options?.actorUser,
    });
    revalidatePath("/catalog");
    return { success: true, message: "Product updated successfully." };
  } catch (err: unknown) {
    return { error: formatCatalogActionError(err, "Failed to update product.") };
  }
}

export async function createVariantAction(
  _prevState: CatalogActionResult | null,
  formData: FormData,
  options?: CatalogActionOptions
): Promise<CatalogActionResult> {
  const productId = formData.get("productId")?.toString() || "";
  const organizationId = formData.get("organizationId")?.toString() || undefined;
  const name = formData.get("name")?.toString() || "";
  const sku = formData.get("sku")?.toString() || null;
  const barcode = formData.get("barcode")?.toString() || null;
  const costPrice = formData.get("costPrice")?.toString() || null;
  const sellingPrice = formData.get("sellingPrice")?.toString() || null;

  try {
    await createProductVariant({
      organizationId,
      productId,
      name,
      sku: sku === "" ? null : sku,
      barcode: barcode === "" ? null : barcode,
      costPrice: costPrice === "" ? null : costPrice,
      sellingPrice: sellingPrice === "" ? null : sellingPrice,
      actorUser: options?.actorUser,
    });
    revalidatePath("/catalog");
    return { success: true, message: `Variant "${name}" added successfully.` };
  } catch (err: unknown) {
    return { error: formatCatalogActionError(err, "Failed to add variant.") };
  }
}

export async function toggleProductActiveAction(
  productId: string,
  isActive: boolean,
  organizationId?: string,
  options?: CatalogActionOptions
): Promise<CatalogActionResult> {
  try {
    await updateProduct({
      organizationId,
      productId,
      isActive,
      actorUser: options?.actorUser,
    });
    revalidatePath("/catalog");
    revalidatePath("/pos");
    return {
      success: true,
      message: `Product ${isActive ? "activated" : "deactivated / discontinued"} successfully.`,
    };
  } catch (err: unknown) {
    return {
      error: formatCatalogActionError(
        err,
        `Failed to ${isActive ? "activate" : "deactivate"} product.`
      ),
    };
  }
}
