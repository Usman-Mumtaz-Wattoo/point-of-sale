import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { SYSTEM_ROLES, type SystemRoleName } from "./roles";
import { getCurrentAppUser } from "./auth";
import {
  CrossTenantViolationError,
  MembershipNotFoundError,
  UnauthorizedRoleError,
} from "./memberships";
import {
  resolveTenantContext,
  TenantContextError,
  AuthRequiredError,
  type TenantUserContext,
} from "./tenant-context";

export const CATALOG_MUTATION_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.INVENTORY_MANAGER,
];

export const CATALOG_READ_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.INVENTORY_MANAGER,
  SYSTEM_ROLES.CASHIER,
  SYSTEM_ROLES.ACCOUNTANT,
];

export class CatalogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogValidationError";
  }
}

export class ProductNotFoundError extends Error {
  constructor(message = "Product not found.") {
    super(message);
    this.name = "ProductNotFoundError";
  }
}

export class CategoryNotFoundError extends Error {
  constructor(message = "Category not found.") {
    super(message);
    this.name = "CategoryNotFoundError";
  }
}

export class VariantNotFoundError extends Error {
  constructor(message = "Product variant not found.") {
    super(message);
    this.name = "VariantNotFoundError";
  }
}

export {
  CrossTenantViolationError,
  MembershipNotFoundError,
  UnauthorizedRoleError,
  TenantContextError,
  AuthRequiredError,
};

/**
 * Resolves the authenticated user's verified tenant context using the shared tenant resolver.
 * Never trusts client-supplied organization IDs without verifying active membership and role.
 */
export async function resolveAuthorizedTenant(params?: {
  organizationId?: string;
  requireMutation?: boolean;
  actorUser?: TenantUserContext | null;
}) {
  const allowedRoles = params?.requireMutation
    ? CATALOG_MUTATION_ROLES
    : CATALOG_READ_ROLES;

  const tenantContext = await resolveTenantContext(params?.organizationId, {
    requireRoles: allowedRoles,
    actorUser: params?.actorUser,
  });

  const user = params?.actorUser !== undefined ? params.actorUser : await getCurrentAppUser();
  if (!user) {
    throw new AuthRequiredError();
  }

  const membership = user.memberships.find(
    (m) => m.organizationId === tenantContext.organizationId
  )!;

  return {
    user,
    membership,
    organizationId: tenantContext.organizationId,
    role: tenantContext.role,
    isOwnerOrManager:
      tenantContext.role === SYSTEM_ROLES.OWNER ||
      tenantContext.role === SYSTEM_ROLES.MANAGER ||
      tenantContext.role === SYSTEM_ROLES.INVENTORY_MANAGER,
    tenantContext,
  };
}

/**
 * Helper to validate and convert monetary values into Prisma.Decimal.
 * Selling price may legitimately be 0.00 for free / promotional goods.
 */
function parsePrice(value: number | string | undefined, fieldName: string, allowZero = true): Prisma.Decimal {
  if (value === undefined || value === null || value === "") {
    return new Prisma.Decimal("0.00");
  }

  const num = typeof value === "number" ? value : Number(value);
  if (isNaN(num)) {
    throw new CatalogValidationError(`${fieldName} must be a valid number.`);
  }

  if (allowZero ? num < 0 : num <= 0) {
    throw new CatalogValidationError(`${fieldName} cannot be negative.`);
  }

  if (num > 999999999.99) {
    throw new CatalogValidationError(`${fieldName} exceeds maximum supported limit.`);
  }

  return new Prisma.Decimal(num.toFixed(2));
}

// ============================================================================
// CATEGORY SERVICES
// ============================================================================

export async function createCategory(input: {
  organizationId?: string;
  name: string;
  description?: string | null;
  actorUser?: TenantUserContext | null;
}) {
  const { organizationId } = await resolveAuthorizedTenant({
    organizationId: input.organizationId,
    requireMutation: true,
    actorUser: input.actorUser,
  });

  const name = input.name?.trim();
  if (!name || name.length < 1 || name.length > 60) {
    throw new CatalogValidationError("Category name must be between 1 and 60 characters.");
  }

  const description = input.description?.trim() || null;
  if (description && description.length > 255) {
    throw new CatalogValidationError("Category description cannot exceed 255 characters.");
  }

  // Enforce tenant-scoped uniqueness
  const existing = await db.category.findUnique({
    where: {
      organizationId_name: {
        organizationId,
        name,
      },
    },
  });

  if (existing) {
    throw new CatalogValidationError(`Category "${name}" already exists in this organization.`);
  }

  return db.category.create({
    data: {
      organizationId,
      name,
      description,
      isActive: true,
    },
  });
}

export async function updateCategory(input: {
  organizationId?: string;
  categoryId: string;
  name?: string;
  description?: string | null;
  isActive?: boolean;
  actorUser?: TenantUserContext | null;
}) {
  const { organizationId } = await resolveAuthorizedTenant({
    organizationId: input.organizationId,
    requireMutation: true,
    actorUser: input.actorUser,
  });

  const category = await db.category.findUnique({
    where: { id: input.categoryId },
  });

  if (!category || category.organizationId !== organizationId) {
    throw new CategoryNotFoundError("Category not found in authorized organization.");
  }

  let name = category.name;
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed || trimmed.length < 1 || trimmed.length > 60) {
      throw new CatalogValidationError("Category name must be between 1 and 60 characters.");
    }
    if (trimmed !== category.name) {
      const existing = await db.category.findUnique({
        where: {
          organizationId_name: {
            organizationId,
            name: trimmed,
          },
        },
      });
      if (existing) {
        throw new CatalogValidationError(`Category "${trimmed}" already exists in this organization.`);
      }
      name = trimmed;
    }
  }

  return db.category.update({
    where: { id: input.categoryId },
    data: {
      name,
      description: input.description !== undefined ? (input.description?.trim() || null) : category.description,
      isActive: input.isActive !== undefined ? input.isActive : category.isActive,
    },
  });
}

export async function getCategories(params?: {
  organizationId?: string;
  includeInactive?: boolean;
  actorUser?: TenantUserContext | null;
}) {
  const { organizationId } = await resolveAuthorizedTenant({
    organizationId: params?.organizationId,
    requireMutation: false,
    actorUser: params?.actorUser,
  });

  return db.category.findMany({
    where: {
      organizationId,
      ...(params?.includeInactive ? {} : { isActive: true }),
    },
    orderBy: { name: "asc" },
  });
}

// ============================================================================
// PRODUCT SERVICES
// ============================================================================

export interface CreateProductInput {
  organizationId?: string;
  categoryId?: string | null;
  name: string;
  description?: string | null;
  sku: string;
  barcode?: string | null;
  brand?: string | null;
  unit?: string;
  costPrice?: number | string;
  sellingPrice: number | string;
  isActive?: boolean;
  actorUser?: TenantUserContext | null;
}

export async function createProduct(input: CreateProductInput) {
  const { organizationId } = await resolveAuthorizedTenant({
    organizationId: input.organizationId,
    requireMutation: true,
    actorUser: input.actorUser,
  });

  const name = input.name?.trim();
  if (!name || name.length < 1 || name.length > 100) {
    throw new CatalogValidationError("Product name must be between 1 and 100 characters.");
  }

  const sku = input.sku?.trim().toUpperCase();
  if (!sku || sku.length < 1 || sku.length > 50) {
    throw new CatalogValidationError("SKU must be between 1 and 50 characters.");
  }

  const barcode = input.barcode?.trim() || null;
  if (barcode && barcode.length > 50) {
    throw new CatalogValidationError("Barcode cannot exceed 50 characters.");
  }

  const brand = input.brand?.trim() || null;
  if (brand && brand.length > 60) {
    throw new CatalogValidationError("Brand cannot exceed 60 characters.");
  }

  const unit = input.unit?.trim().toLowerCase() || "piece";
  if (!unit || unit.length > 20) {
    throw new CatalogValidationError("Unit must be between 1 and 20 characters.");
  }

  const costPrice = parsePrice(input.costPrice, "Cost Price", true);
  const sellingPrice = parsePrice(input.sellingPrice, "Selling Price", true);

  // Cross-tenant category validation:
  // If categoryId is supplied, it MUST belong to the SAME organization!
  if (input.categoryId) {
    const category = await db.category.findUnique({
      where: { id: input.categoryId },
      select: { id: true, organizationId: true },
    });
    if (!category || category.organizationId !== organizationId) {
      throw new CrossTenantViolationError(
        "Multi-tenant violation: Cannot assign a category belonging to another organization."
      );
    }
  }

  // Tenant-scoped unique checks
  const existingSku = await db.product.findUnique({
    where: {
      organizationId_sku: {
        organizationId,
        sku,
      },
    },
  });
  if (existingSku) {
    throw new CatalogValidationError(`A product with SKU "${sku}" already exists in this organization.`);
  }

  const existingVariantSku = await db.productVariant.findUnique({
    where: {
      organizationId_sku: {
        organizationId,
        sku,
      },
    },
  });
  if (existingVariantSku) {
    throw new CatalogValidationError(`A product variant with SKU "${sku}" already exists in this organization.`);
  }

  if (barcode) {
    const existingBarcode = await db.product.findUnique({
      where: {
        organizationId_barcode: {
          organizationId,
          barcode,
        },
      },
    });
    if (existingBarcode) {
      throw new CatalogValidationError(`A product with barcode "${barcode}" already exists in this organization.`);
    }

    const existingVariantBarcode = await db.productVariant.findUnique({
      where: {
        organizationId_barcode: {
          organizationId,
          barcode,
        },
      },
    });
    if (existingVariantBarcode) {
      throw new CatalogValidationError(`A product variant with barcode "${barcode}" already exists in this organization.`);
    }
  }

  try {
    return await db.product.create({
      data: {
        organizationId,
        categoryId: input.categoryId || null,
        name,
        description: input.description?.trim() || null,
        sku,
        barcode,
        brand,
        unit,
        costPrice,
        sellingPrice,
        isActive: input.isActive ?? true,
      },
      include: {
        category: true,
        variants: true,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = String(err.meta?.target || "");
      if (target.includes("sku")) {
        throw new CatalogValidationError(`A product or variant with SKU "${sku}" already exists in this organization.`);
      }
      if (target.includes("barcode")) {
        throw new CatalogValidationError(`A product or variant with barcode "${barcode}" already exists in this organization.`);
      }
    }
    throw err;
  }
}

export interface UpdateProductInput {
  organizationId?: string;
  productId: string;
  categoryId?: string | null;
  name?: string;
  description?: string | null;
  sku?: string;
  barcode?: string | null;
  brand?: string | null;
  unit?: string;
  costPrice?: number | string;
  sellingPrice?: number | string;
  isActive?: boolean;
  actorUser?: TenantUserContext | null;
}

export async function updateProduct(input: UpdateProductInput) {
  const { organizationId } = await resolveAuthorizedTenant({
    organizationId: input.organizationId,
    requireMutation: true,
    actorUser: input.actorUser,
  });

  const product = await db.product.findUnique({
    where: { id: input.productId },
  });

  if (!product || product.organizationId !== organizationId) {
    throw new ProductNotFoundError("Product not found in authorized organization.");
  }

  // Category validation
  let categoryId = product.categoryId;
  if (input.categoryId !== undefined) {
    if (input.categoryId === null || input.categoryId === "") {
      categoryId = null;
    } else {
      const category = await db.category.findUnique({
        where: { id: input.categoryId },
        select: { id: true, organizationId: true },
      });
      if (!category || category.organizationId !== organizationId) {
        throw new CrossTenantViolationError(
          "Multi-tenant violation: Cannot assign a category belonging to another organization."
        );
      }
      categoryId = input.categoryId;
    }
  }

  // SKU validation
  let sku = product.sku;
  if (input.sku !== undefined) {
    const trimmedSku = input.sku.trim().toUpperCase();
    if (!trimmedSku || trimmedSku.length < 1 || trimmedSku.length > 50) {
      throw new CatalogValidationError("SKU must be between 1 and 50 characters.");
    }
    if (trimmedSku !== product.sku) {
      const existingSku = await db.product.findUnique({
        where: {
          organizationId_sku: {
            organizationId,
            sku: trimmedSku,
          },
        },
      });
      if (existingSku) {
        throw new CatalogValidationError(`A product with SKU "${trimmedSku}" already exists in this organization.`);
      }
      const existingVariantSku = await db.productVariant.findUnique({
        where: {
          organizationId_sku: {
            organizationId,
            sku: trimmedSku,
          },
        },
      });
      if (existingVariantSku) {
        throw new CatalogValidationError(`A product variant with SKU "${trimmedSku}" already exists in this organization.`);
      }
      sku = trimmedSku;
    }
  }

  // Barcode validation
  let barcode = product.barcode;
  if (input.barcode !== undefined) {
    const trimmedBarcode = input.barcode?.trim() || null;
    if (trimmedBarcode && trimmedBarcode.length > 50) {
      throw new CatalogValidationError("Barcode cannot exceed 50 characters.");
    }
    if (trimmedBarcode !== product.barcode) {
      if (trimmedBarcode) {
        const existingBarcode = await db.product.findUnique({
          where: {
            organizationId_barcode: {
              organizationId,
              barcode: trimmedBarcode,
            },
          },
        });
        if (existingBarcode) {
          throw new CatalogValidationError(`A product with barcode "${trimmedBarcode}" already exists in this organization.`);
        }
        const existingVariantBarcode = await db.productVariant.findUnique({
          where: {
            organizationId_barcode: {
              organizationId,
              barcode: trimmedBarcode,
            },
          },
        });
        if (existingVariantBarcode) {
          throw new CatalogValidationError(`A product variant with barcode "${trimmedBarcode}" already exists in this organization.`);
        }
      }
      barcode = trimmedBarcode;
    }
  }

  const name = input.name !== undefined ? input.name.trim() : product.name;
  if (!name || name.length < 1 || name.length > 100) {
    throw new CatalogValidationError("Product name must be between 1 and 100 characters.");
  }

  const costPrice =
    input.costPrice !== undefined ? parsePrice(input.costPrice, "Cost Price", true) : product.costPrice;
  const sellingPrice =
    input.sellingPrice !== undefined ? parsePrice(input.sellingPrice, "Selling Price", true) : product.sellingPrice;

  try {
    return await db.product.update({
      where: { id: input.productId },
      data: {
        categoryId,
        name,
        description: input.description !== undefined ? (input.description?.trim() || null) : product.description,
        sku,
        barcode,
        brand: input.brand !== undefined ? (input.brand?.trim() || null) : product.brand,
        unit: input.unit !== undefined ? (input.unit?.trim().toLowerCase() || "piece") : product.unit,
        costPrice,
        sellingPrice,
        isActive: input.isActive !== undefined ? input.isActive : product.isActive,
      },
      include: {
        category: true,
        variants: true,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = String(err.meta?.target || "");
      if (target.includes("sku")) {
        throw new CatalogValidationError(`A product or variant with SKU "${sku}" already exists in this organization.`);
      }
      if (target.includes("barcode")) {
        throw new CatalogValidationError(`A product or variant with barcode "${barcode}" already exists in this organization.`);
      }
    }
    throw err;
  }
}

export async function getProducts(params?: {
  organizationId?: string;
  search?: string;
  categoryId?: string;
  includeInactive?: boolean;
  take?: number;
  skip?: number;
  actorUser?: TenantUserContext | null;
}) {
  const { organizationId } = await resolveAuthorizedTenant({
    organizationId: params?.organizationId,
    requireMutation: false,
    actorUser: params?.actorUser,
  });

  const search = params?.search?.trim();

  const whereClause: Prisma.ProductWhereInput = {
    organizationId,
    ...(params?.includeInactive ? {} : { isActive: true }),
    ...(params?.categoryId ? { categoryId: params.categoryId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { barcode: { contains: search, mode: "insensitive" } },
            { brand: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  return db.product.findMany({
    where: whereClause,
    include: {
      category: true,
      variants: {
        where: params?.includeInactive ? {} : { isActive: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: params?.take ?? 50,
    skip: params?.skip ?? 0,
  });
}

export async function getProductById(params: {
  organizationId?: string;
  productId: string;
  actorUser?: TenantUserContext | null;
}) {
  const { organizationId } = await resolveAuthorizedTenant({
    organizationId: params.organizationId,
    requireMutation: false,
    actorUser: params.actorUser,
  });

  const product = await db.product.findUnique({
    where: { id: params.productId },
    include: {
      category: true,
      variants: {
        orderBy: { name: "asc" },
      },
    },
  });

  if (!product || product.organizationId !== organizationId) {
    throw new ProductNotFoundError("Product not found in authorized organization.");
  }

  return product;
}

// ============================================================================
// PRODUCT VARIANT SERVICES
// ============================================================================

export interface CreateProductVariantInput {
  organizationId?: string;
  productId: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  costPrice?: number | string | null;
  sellingPrice?: number | string | null;
  isActive?: boolean;
  actorUser?: TenantUserContext | null;
}

export async function createProductVariant(input: CreateProductVariantInput) {
  const { organizationId } = await resolveAuthorizedTenant({
    organizationId: input.organizationId,
    requireMutation: true,
    actorUser: input.actorUser,
  });

  // Verify parent product belongs to this organization
  const product = await db.product.findUnique({
    where: { id: input.productId },
    select: { id: true, organizationId: true },
  });

  if (!product || product.organizationId !== organizationId) {
    throw new ProductNotFoundError("Parent product not found in authorized organization.");
  }

  const name = input.name?.trim();
  if (!name || name.length < 1 || name.length > 60) {
    throw new CatalogValidationError("Variant name must be between 1 and 60 characters.");
  }

  // Check duplicate variant name for this parent product
  const existingVariant = await db.productVariant.findUnique({
    where: {
      productId_name: {
        productId: product.id,
        name,
      },
    },
  });

  if (existingVariant) {
    throw new CatalogValidationError(`Variant "${name}" already exists for this product.`);
  }

  const sku = input.sku?.trim().toUpperCase() || null;
  if (sku) {
    if (sku.length > 50) {
      throw new CatalogValidationError("Variant SKU cannot exceed 50 characters.");
    }
    const existingVariantSku = await db.productVariant.findUnique({
      where: {
        organizationId_sku: {
          organizationId,
          sku,
        },
      },
    });
    if (existingVariantSku) {
      throw new CatalogValidationError(`A product variant with SKU "${sku}" already exists in this organization.`);
    }
    const existingProductSku = await db.product.findUnique({
      where: {
        organizationId_sku: {
          organizationId,
          sku,
        },
      },
    });
    if (existingProductSku) {
      throw new CatalogValidationError(`A product with SKU "${sku}" already exists in this organization.`);
    }
  }

  const barcode = input.barcode?.trim() || null;
  if (barcode) {
    if (barcode.length > 50) {
      throw new CatalogValidationError("Variant barcode cannot exceed 50 characters.");
    }
    const existingVariantBarcode = await db.productVariant.findUnique({
      where: {
        organizationId_barcode: {
          organizationId,
          barcode,
        },
      },
    });
    if (existingVariantBarcode) {
      throw new CatalogValidationError(`A product variant with barcode "${barcode}" already exists in this organization.`);
    }
    const existingProductBarcode = await db.product.findUnique({
      where: {
        organizationId_barcode: {
          organizationId,
          barcode,
        },
      },
    });
    if (existingProductBarcode) {
      throw new CatalogValidationError(`A product with barcode "${barcode}" already exists in this organization.`);
    }
  }

  const costPrice =
    input.costPrice !== undefined && input.costPrice !== null && input.costPrice !== ""
      ? parsePrice(input.costPrice, "Variant Cost Price", true)
      : null;
  const sellingPrice =
    input.sellingPrice !== undefined && input.sellingPrice !== null && input.sellingPrice !== ""
      ? parsePrice(input.sellingPrice, "Variant Selling Price", true)
      : null;

  try {
    return await db.productVariant.create({
      data: {
        organizationId,
        productId: product.id,
        name,
        sku,
        barcode,
        costPrice,
        sellingPrice,
        isActive: input.isActive ?? true,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = String(err.meta?.target || "");
      if (target.includes("sku")) {
        throw new CatalogValidationError(`A product or variant with SKU "${sku}" already exists in this organization.`);
      }
      if (target.includes("barcode")) {
        throw new CatalogValidationError(`A product or variant with barcode "${barcode}" already exists in this organization.`);
      }
      if (target.includes("name")) {
        throw new CatalogValidationError(`Variant "${name}" already exists for this product.`);
      }
    }
    throw err;
  }
}

export interface UpdateProductVariantInput {
  organizationId?: string;
  variantId: string;
  name?: string;
  sku?: string | null;
  barcode?: string | null;
  costPrice?: number | string | null;
  sellingPrice?: number | string | null;
  isActive?: boolean;
  actorUser?: TenantUserContext | null;
}

export async function updateProductVariant(input: UpdateProductVariantInput) {
  const { organizationId } = await resolveAuthorizedTenant({
    organizationId: input.organizationId,
    requireMutation: true,
    actorUser: input.actorUser,
  });

  const variant = await db.productVariant.findUnique({
    where: { id: input.variantId },
    include: { product: true },
  });

  if (!variant || variant.product.organizationId !== organizationId) {
    throw new VariantNotFoundError("Variant not found in authorized organization.");
  }

  let name = variant.name;
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed || trimmed.length < 1 || trimmed.length > 60) {
      throw new CatalogValidationError("Variant name must be between 1 and 60 characters.");
    }
    if (trimmed !== variant.name) {
      const existing = await db.productVariant.findUnique({
        where: {
          productId_name: {
            productId: variant.productId,
            name: trimmed,
          },
        },
      });
      if (existing) {
        throw new CatalogValidationError(`Variant "${trimmed}" already exists for this product.`);
      }
      name = trimmed;
    }
  }

  let sku = variant.sku;
  if (input.sku !== undefined) {
    const trimmedSku = input.sku?.trim().toUpperCase() || null;
    if (trimmedSku && trimmedSku.length > 50) {
      throw new CatalogValidationError("Variant SKU cannot exceed 50 characters.");
    }
    if (trimmedSku !== variant.sku) {
      if (trimmedSku) {
        const existingVariantSku = await db.productVariant.findUnique({
          where: {
            organizationId_sku: {
              organizationId,
              sku: trimmedSku,
            },
          },
        });
        if (existingVariantSku && existingVariantSku.id !== variant.id) {
          throw new CatalogValidationError(`A product variant with SKU "${trimmedSku}" already exists in this organization.`);
        }
        const existingProductSku = await db.product.findUnique({
          where: {
            organizationId_sku: {
              organizationId,
              sku: trimmedSku,
            },
          },
        });
        if (existingProductSku) {
          throw new CatalogValidationError(`A product with SKU "${trimmedSku}" already exists in this organization.`);
        }
      }
      sku = trimmedSku;
    }
  }

  let barcode = variant.barcode;
  if (input.barcode !== undefined) {
    const trimmedBarcode = input.barcode?.trim() || null;
    if (trimmedBarcode && trimmedBarcode.length > 50) {
      throw new CatalogValidationError("Variant barcode cannot exceed 50 characters.");
    }
    if (trimmedBarcode !== variant.barcode) {
      if (trimmedBarcode) {
        const existingVariantBarcode = await db.productVariant.findUnique({
          where: {
            organizationId_barcode: {
              organizationId,
              barcode: trimmedBarcode,
            },
          },
        });
        if (existingVariantBarcode && existingVariantBarcode.id !== variant.id) {
          throw new CatalogValidationError(`A product variant with barcode "${trimmedBarcode}" already exists in this organization.`);
        }
        const existingProductBarcode = await db.product.findUnique({
          where: {
            organizationId_barcode: {
              organizationId,
              barcode: trimmedBarcode,
            },
          },
        });
        if (existingProductBarcode) {
          throw new CatalogValidationError(`A product with barcode "${trimmedBarcode}" already exists in this organization.`);
        }
      }
      barcode = trimmedBarcode;
    }
  }

  const costPrice =
    input.costPrice !== undefined
      ? input.costPrice === null || input.costPrice === ""
        ? null
        : parsePrice(input.costPrice, "Variant Cost Price", true)
      : variant.costPrice;

  const sellingPrice =
    input.sellingPrice !== undefined
      ? input.sellingPrice === null || input.sellingPrice === ""
        ? null
        : parsePrice(input.sellingPrice, "Variant Selling Price", true)
      : variant.sellingPrice;

  try {
    return await db.productVariant.update({
      where: { id: input.variantId },
      data: {
        name,
        sku,
        barcode,
        costPrice,
        sellingPrice,
        isActive: input.isActive !== undefined ? input.isActive : variant.isActive,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = String(err.meta?.target || "");
      if (target.includes("sku")) {
        throw new CatalogValidationError(`A product or variant with SKU "${sku}" already exists in this organization.`);
      }
      if (target.includes("barcode")) {
        throw new CatalogValidationError(`A product or variant with barcode "${barcode}" already exists in this organization.`);
      }
      if (target.includes("name")) {
        throw new CatalogValidationError(`Variant "${name}" already exists for this product.`);
      }
    }
    throw err;
  }
}
