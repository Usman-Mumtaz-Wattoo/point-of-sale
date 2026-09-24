"use server";

import { revalidatePath } from "next/cache";
import {
  createCategory,
  createProduct,
  updateProduct,
  createProductVariant,
  CatalogValidationError,
} from "@/lib/catalog";

export interface CatalogActionResult {
  error?: string;
  success?: boolean;
  message?: string;
}

export async function createCategoryAction(
  _prevState: CatalogActionResult | null,
  formData: FormData
): Promise<CatalogActionResult> {
  const name = formData.get("name")?.toString() || "";
  const description = formData.get("description")?.toString() || undefined;
  const organizationId = formData.get("organizationId")?.toString() || undefined;

  try {
    await createCategory({
      organizationId,
      name,
      description,
    });
    revalidatePath("/catalog");
    return { success: true, message: `Category "${name}" created successfully.` };
  } catch (err: unknown) {
    if (err instanceof CatalogValidationError || err instanceof Error) {
      return { error: err.message };
    }
    return { error: "Failed to create category." };
  }
}

export async function createProductAction(
  _prevState: CatalogActionResult | null,
  formData: FormData
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
    });
    revalidatePath("/catalog");
    return { success: true, message: `Product "${name}" created successfully.` };
  } catch (err: unknown) {
    if (err instanceof CatalogValidationError || err instanceof Error) {
      return { error: err.message };
    }
    return { error: "Failed to create product." };
  }
}

export async function updateProductAction(
  _prevState: CatalogActionResult | null,
  formData: FormData
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
    });
    revalidatePath("/catalog");
    return { success: true, message: "Product updated successfully." };
  } catch (err: unknown) {
    if (err instanceof CatalogValidationError || err instanceof Error) {
      return { error: err.message };
    }
    return { error: "Failed to update product." };
  }
}

export async function createVariantAction(
  _prevState: CatalogActionResult | null,
  formData: FormData
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
    });
    revalidatePath("/catalog");
    return { success: true, message: `Variant "${name}" added successfully.` };
  } catch (err: unknown) {
    if (err instanceof CatalogValidationError || err instanceof Error) {
      return { error: err.message };
    }
    return { error: "Failed to add variant." };
  }
}
