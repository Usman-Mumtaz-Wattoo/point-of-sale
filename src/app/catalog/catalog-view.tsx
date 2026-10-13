"use client";

import { useState, useActionState, useTransition } from "react";
import { Plus, Search, Package, X, Tag, AlertTriangle } from "lucide-react";
import {
  createCategoryAction,
  createProductAction,
  createVariantAction,
  toggleProductActiveAction,
  type CatalogActionResult,
} from "./actions";
import { formatMoney } from "@/lib/currency";
import { getProductImagePath, DEFAULT_PRODUCT_FALLBACK_IMAGE } from "@/lib/product-images";

interface CategoryItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

interface ProductVariantItem {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  costPrice: unknown;
  sellingPrice: unknown;
  isActive: boolean;
}

interface ProductItem {
  id: string;
  name: string;
  description: string | null;
  sku: string;
  barcode: string | null;
  brand: string | null;
  imageUrl?: string | null;
  unit: string;
  costPrice: unknown;
  sellingPrice: unknown;
  isActive: boolean;
  category: { id: string; name: string } | null;
  variants: ProductVariantItem[];
}

const PRODUCT_IMAGE_PRESETS = [
  { label: "Apples", path: "/images/products/prd-app-001.svg" },
  { label: "Bananas", path: "/images/products/prd-ban-001.svg" },
  { label: "Spinach", path: "/images/products/prd-spn-001.svg" },
  { label: "Citrus", path: "/images/products/prd-kin-001.svg" },
  { label: "Sourdough", path: "/images/products/bak-srd-001.svg" },
  { label: "Croissant", path: "/images/products/bak-crs-001.svg" },
  { label: "Bread", path: "/images/products/bak-brd-001.svg" },
  { label: "Rice", path: "/images/products/pnt-ric-001.svg" },
  { label: "Olive Oil", path: "/images/products/pnt-oil-001.svg" },
  { label: "Pink Salt", path: "/images/products/pnt-slt-001.svg" },
  { label: "Honey", path: "/images/products/pnt-hny-001.svg" },
  { label: "Milk", path: "/images/products/dar-mlk-001.svg" },
  { label: "Yogurt", path: "/images/products/dar-ygt-001.svg" },
  { label: "Orange Juice", path: "/images/products/dar-ojc-001.svg" },
  { label: "Butter", path: "/images/products/dar-btr-001.svg" },
];

export function CatalogView({
  organizationId,
  organizationName,
  currency = "PKR",
  userRole,
  canMutate,
  categories,
  products,
  currentSearch,
  currentCategory,
}: {
  organizationId: string;
  organizationName: string;
  currency?: string;
  userRole: string;
  canMutate: boolean;
  categories: CategoryItem[];
  products: ProductItem[];
  currentSearch?: string;
  currentCategory?: string;
}) {
  const [showProductModal, setShowProductModal] = useState(false);
  const [productImageUrl, setProductImageUrl] = useState("");
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedProductForVariant, setSelectedProductForVariant] = useState<ProductItem | null>(null);
  const [confirmDeactivateProduct, setConfirmDeactivateProduct] = useState<ProductItem | null>(null);
  const [toggleStatusMessage, setToggleStatusMessage] = useState<string | null>(null);
  const [toggleStatusError, setToggleStatusError] = useState<string | null>(null);
  const [isTogglingStatus, startToggleStatus] = useTransition();

  const handleToggleProductStatus = (product: ProductItem, newActiveState: boolean) => {
    setToggleStatusMessage(null);
    setToggleStatusError(null);
    startToggleStatus(async () => {
      try {
        const res = await toggleProductActiveAction(product.id, newActiveState, organizationId);
        if (res.error) {
          setToggleStatusError(res.error);
        } else {
          setToggleStatusMessage(res.message || "Product status updated successfully.");
          setConfirmDeactivateProduct(null);
        }
      } catch (err) {
        setToggleStatusError(err instanceof Error ? err.message : "Failed to update product status.");
      }
    });
  };

  const [categoryState, categoryFormAction, isCategoryPending] = useActionState<
    CatalogActionResult | null,
    FormData
  >(createCategoryAction, null);

  const [productState, productFormAction, isProductPending] = useActionState<
    CatalogActionResult | null,
    FormData
  >(createProductAction, null);

  const [variantState, variantFormAction, isVariantPending] = useActionState<
    CatalogActionResult | null,
    FormData
  >(createVariantAction, null);

  return (
    <div className="space-y-6">
      {/* Action feedback */}
      {(categoryState?.message || productState?.message || variantState?.message || toggleStatusMessage) && (
        <div className="p-3.5 text-xs font-semibold rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
          {categoryState?.message || productState?.message || variantState?.message || toggleStatusMessage}
        </div>
      )}

      {(categoryState?.error || productState?.error || variantState?.error || toggleStatusError) && (
        <div className="p-3.5 text-xs font-semibold rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300">
          {categoryState?.error || productState?.error || variantState?.error || toggleStatusError}
        </div>
      )}

      {/* SEARCH AND FILTERS */}
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <form method="GET" className="flex flex-1 gap-2.5 w-full">
          <input type="hidden" name="org" value={organizationId} />
          <div className="relative flex-1">
            <input
              type="text"
              name="search"
              defaultValue={currentSearch}
              placeholder="Search by name, SKU, or barcode..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>

          <select
            name="category"
            defaultValue={currentCategory || ""}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            Search
          </button>
        </form>

        {canMutate && (
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              onClick={() => setShowCategoryModal(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Tag className="w-3.5 h-3.5" /> + Category
            </button>
            <button
              onClick={() => setShowProductModal(true)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> + Add Product
            </button>
          </div>
        )}
      </div>

      {/* PRODUCTS TABLE */}
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-500" />
            <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Product Inventory List ({products.length})
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Tenant: {organizationName} • Role: {userRole}
          </span>
        </div>

        {products.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto text-xl border border-indigo-200 dark:border-slate-700">
              <Package className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">No products found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              {canMutate
                ? "Get started by adding your first product definition or category to the catalog."
                : "No products currently available in this organization."}
            </p>
            {canMutate && (
              <button
                onClick={() => setShowProductModal(true)}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Create Product
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-900/70 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3.5">Product Name</th>
                  <th className="p-3.5">SKU</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Barcode</th>
                  <th className="p-3.5">Cost Price</th>
                  <th className="p-3.5">Selling Price</th>
                  <th className="p-3.5">Unit</th>
                  <th className="p-3.5">Variants</th>
                  {canMutate && <th className="p-3.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                    <td className="p-3.5 font-sans font-semibold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center p-0.5">
                          <img
                            src={getProductImagePath(p.sku, p.name, p.imageUrl)}
                            alt={p.name}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = DEFAULT_PRODUCT_FALLBACK_IMAGE;
                            }}
                          />
                        </div>
                        <div>
                          <div>{p.name}</div>
                          {p.brand && <span className="text-[10px] text-slate-400 font-normal">{p.brand}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5 text-indigo-600 dark:text-indigo-400 font-bold">{p.sku}</td>
                    <td className="p-3.5 font-sans">
                      {p.isActive ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          Discontinued
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 font-sans text-slate-500 dark:text-slate-400">
                      {p.category?.name ?? "—"}
                    </td>
                    <td className="p-3.5 text-slate-500 dark:text-slate-400">{p.barcode ?? "—"}</td>
                    <td className="p-3.5 text-slate-500 dark:text-slate-400">
                      {formatMoney(p.costPrice as any, currency)}
                    </td>
                    <td className="p-3.5 text-slate-900 dark:text-white font-bold">
                      {formatMoney(p.sellingPrice as any, currency)}
                    </td>
                    <td className="p-3.5 font-sans capitalize text-slate-500 dark:text-slate-400">{p.unit}</td>
                    <td className="p-3.5 font-sans">
                      {p.variants.length > 0 ? (
                        <div className="space-y-1">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                            {p.variants.length} variant{p.variants.length > 1 ? "s" : ""}
                          </span>
                          <div className="text-[10px] text-slate-400 max-w-xs truncate">
                            {p.variants.map((v) => v.name).join(", ")}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">—</span>
                      )}
                    </td>
                    {canMutate && (
                      <td className="p-3.5 text-right font-sans">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedProductForVariant(p)}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
                          >
                            + Variant
                          </button>
                          {p.isActive ? (
                            <button
                              type="button"
                              onClick={() => setConfirmDeactivateProduct(p)}
                              title="Discontinue product from new sales"
                              className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 transition-colors cursor-pointer"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isTogglingStatus}
                              onClick={() => handleToggleProductStatus(p, true)}
                              title="Restore product to active catalog"
                              className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                            >
                              Reactivate
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE CATEGORY MODAL */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Add Category</h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              action={async (formData) => {
                await categoryFormAction(formData);
                setShowCategoryModal(false);
              }}
              className="space-y-4"
            >
              <input type="hidden" name="organizationId" value={organizationId} />

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Category Name <span className="text-indigo-500">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Beverages, Apparel, Footwear"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Description
                </label>
                <input
                  name="description"
                  type="text"
                  placeholder="Optional brief description"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCategoryPending}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 shadow-xs"
                >
                  {isCategoryPending ? "Saving..." : "Save Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE PRODUCT MODAL */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Create New Product</h3>
              <button
                onClick={() => {
                  setShowProductModal(false);
                  setProductImageUrl("");
                }}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              action={async (formData) => {
                await productFormAction(formData);
                setShowProductModal(false);
                setProductImageUrl("");
              }}
              className="space-y-4"
            >
              <input type="hidden" name="organizationId" value={organizationId} />

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Product Name <span className="text-indigo-500">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Nike Air Force Shoes"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    SKU <span className="text-indigo-500">*</span>
                  </label>
                  <input
                    name="sku"
                    type="text"
                    required
                    placeholder="e.g. SHOE-001"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono uppercase placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Category
                  </label>
                  <select
                    name="categoryId"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">None</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Barcode
                  </label>
                  <input
                    name="barcode"
                    type="text"
                    placeholder="e.g. 896400012345"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Brand
                  </label>
                  <input
                    name="brand"
                    type="text"
                    placeholder="e.g. Nike, Adidas"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Unit
                  </label>
                  <input
                    name="unit"
                    type="text"
                    defaultValue="piece"
                    placeholder="piece, kg, pack"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Cost Price
                  </label>
                  <input
                    name="costPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue="0.00"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Selling Price <span className="text-indigo-500">*</span>
                  </label>
                  <input
                    name="sellingPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    defaultValue="0.00"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Product Image Selection & Live Preview */}
              <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Product Image (Manual URL or Preset)
                  </label>
                  {productImageUrl && (
                    <button
                      type="button"
                      onClick={() => setProductImageUrl("")}
                      className="text-[10px] text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Live Thumbnail Preview */}
                  <div className="w-16 h-16 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center p-1 overflow-hidden">
                    <img
                      src={productImageUrl.trim() ? productImageUrl.trim() : DEFAULT_PRODUCT_FALLBACK_IMAGE}
                      alt="Product preview"
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = DEFAULT_PRODUCT_FALLBACK_IMAGE;
                      }}
                    />
                  </div>

                  <div className="flex-1 space-y-1">
                    <input
                      name="imageUrl"
                      type="text"
                      value={productImageUrl}
                      onChange={(e) => setProductImageUrl(e.target.value)}
                      placeholder="Paste image URL (e.g. https://... or select below)"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[10px] text-slate-400">
                      Enter any image URL or click one of the quick presets below:
                    </p>
                  </div>
                </div>

                {/* Preset Chips */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {PRODUCT_IMAGE_PRESETS.map((preset) => (
                    <button
                      key={preset.path}
                      type="button"
                      onClick={() => setProductImageUrl(preset.path)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                        productImageUrl === preset.path
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400"
                      }`}
                    >
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={2}
                  placeholder="Optional product details"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowProductModal(false);
                    setProductImageUrl("");
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProductPending}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 shadow-xs"
                >
                  {isProductPending ? "Saving..." : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE VARIANT MODAL */}
      {selectedProductForVariant && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Add Variant</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  For: <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{selectedProductForVariant.name}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedProductForVariant(null)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              action={async (formData) => {
                await variantFormAction(formData);
                setSelectedProductForVariant(null);
              }}
              className="space-y-4"
            >
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="productId" value={selectedProductForVariant.id} />

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Variant Name <span className="text-indigo-500">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Size 42, Black"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Variant SKU
                  </label>
                  <input
                    name="sku"
                    type="text"
                    placeholder="e.g. SHOE-42-BLK"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono uppercase placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Variant Barcode
                  </label>
                  <input
                    name="barcode"
                    type="text"
                    placeholder="Optional barcode"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Variant Cost Price
                  </label>
                  <input
                    name="costPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Default parent cost"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Variant Selling Price
                  </label>
                  <input
                    name="sellingPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Default parent price"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedProductForVariant(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVariantPending}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 shadow-xs"
                >
                  {isVariantPending ? "Saving..." : "Save Variant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM PRODUCT DEACTIVATION MODAL */}
      {confirmDeactivateProduct && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="deactivate-product-title"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 id="deactivate-product-title" className="text-sm font-bold text-slate-900 dark:text-white">
                  Discontinue Product
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  {confirmDeactivateProduct.name} ({confirmDeactivateProduct.sku})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to deactivate and discontinue this product?
              It will immediately stop appearing in new POS checkout searches. Historical sales, receipts, inventory movement records, and purchase orders will remain permanently intact.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setConfirmDeactivateProduct(null)}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isTogglingStatus}
                onClick={() => handleToggleProductStatus(confirmDeactivateProduct, false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {isTogglingStatus ? "Deactivating..." : "Confirm Deactivation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
