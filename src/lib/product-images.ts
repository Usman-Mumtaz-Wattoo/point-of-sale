/**
 * Stable product image mapping for retail POS catalog.
 * Maps product SKU (and keywords) to locally stored, production-safe assets.
 */

export const PRODUCT_IMAGE_MAP: Record<string, string> = {
  // Produce
  "PRD-APP-001": "/images/products/prd-app-001.svg",
  "PRD-BAN-001": "/images/products/prd-ban-001.svg",
  "PRD-SPN-001": "/images/products/prd-spn-001.svg",
  "PRD-KIN-001": "/images/products/prd-kin-001.svg",

  // Bakery
  "BAK-SRD-001": "/images/products/bak-srd-001.svg",
  "BAK-CRS-001": "/images/products/bak-crs-001.svg",
  "BAK-BRD-001": "/images/products/bak-brd-001.svg",

  // Pantry & Staples
  "PNT-RIC-001": "/images/products/pnt-ric-001.svg",
  "PNT-OIL-001": "/images/products/pnt-oil-001.svg",
  "PNT-SLT-001": "/images/products/pnt-slt-001.svg",
  "PNT-HNY-001": "/images/products/pnt-hny-001.svg",

  // Dairy & Chilled
  "DAR-MLK-001": "/images/products/dar-mlk-001.svg",
  "DAR-YGT-001": "/images/products/dar-ygt-001.svg",
  "DAR-OJC-001": "/images/products/dar-ojc-001.svg",
  "DAR-BTR-001": "/images/products/dar-btr-001.svg",
};

export const DEFAULT_PRODUCT_FALLBACK_IMAGE = "/images/products/fallback-product.svg";

/**
 * Resolves the image path for a product based on its custom imageUrl, SKU, or name.
 * Always returns a valid image path.
 */
export function getProductImagePath(
  sku?: string | null,
  name?: string | null,
  customImageUrl?: string | null
): string {
  if (customImageUrl && customImageUrl.trim()) {
    return customImageUrl.trim();
  }

  if (sku && PRODUCT_IMAGE_MAP[sku]) {
    return PRODUCT_IMAGE_MAP[sku];
  }

  // Name-based fallback matching if SKU differs
  if (name) {
    const lower = name.toLowerCase();
    if (lower.includes("apple")) return "/images/products/prd-app-001.svg";
    if (lower.includes("banana")) return "/images/products/prd-ban-001.svg";
    if (lower.includes("spinach")) return "/images/products/prd-spn-001.svg";
    if (lower.includes("citrus") || lower.includes("kinnow")) return "/images/products/prd-kin-001.svg";
    if (lower.includes("sourdough")) return "/images/products/bak-srd-001.svg";
    if (lower.includes("croissant")) return "/images/products/bak-crs-001.svg";
    if (lower.includes("bread")) return "/images/products/bak-brd-001.svg";
    if (lower.includes("rice")) return "/images/products/pnt-ric-001.svg";
    if (lower.includes("olive oil") || lower.includes("oil")) return "/images/products/pnt-oil-001.svg";
    if (lower.includes("salt")) return "/images/products/pnt-slt-001.svg";
    if (lower.includes("honey")) return "/images/products/pnt-hny-001.svg";
    if (lower.includes("milk")) return "/images/products/dar-mlk-001.svg";
    if (lower.includes("yogurt")) return "/images/products/dar-ygt-001.svg";
    if (lower.includes("juice")) return "/images/products/dar-ojc-001.svg";
    if (lower.includes("butter")) return "/images/products/dar-btr-001.svg";
    if (lower.includes("coffee")) return "/images/products/fallback-coffee.svg";
    if (lower.includes("mug")) return "/images/products/fallback-mug.svg";
  }

  return DEFAULT_PRODUCT_FALLBACK_IMAGE;
}
