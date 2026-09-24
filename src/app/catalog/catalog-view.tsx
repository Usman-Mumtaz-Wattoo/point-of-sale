"use client";

import { useState, useActionState } from "react";
import {
  createCategoryAction,
  createProductAction,
  createVariantAction,
  type CatalogActionResult,
} from "./actions";

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
  unit: string;
  costPrice: unknown;
  sellingPrice: unknown;
  isActive: boolean;
  category: { id: string; name: string } | null;
  variants: ProductVariantItem[];
}

export function CatalogView({
  organizationId,
  organizationName,
  userRole,
  canMutate,
  categories,
  products,
  currentSearch,
  currentCategory,
}: {
  organizationId: string;
  organizationName: string;
  userRole: string;
  canMutate: boolean;
  categories: CategoryItem[];
  products: ProductItem[];
  currentSearch?: string;
  currentCategory?: string;
}) {
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedProductForVariant, setSelectedProductForVariant] = useState<ProductItem | null>(null);

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
      {(categoryState?.message || productState?.message || variantState?.message) && (
        <div className="p-3 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          {categoryState?.message || productState?.message || variantState?.message}
        </div>
      )}

      {(categoryState?.error || productState?.error || variantState?.error) && (
        <div className="p-3 text-xs rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
          {categoryState?.error || productState?.error || variantState?.error}
        </div>
      )}

      {/* SEARCH AND FILTERS */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <form method="GET" className="flex flex-1 gap-2 w-full">
          <input
            type="hidden"
            name="org"
            value={organizationId}
          />
          <input
            type="text"
            name="search"
            defaultValue={currentSearch}
            placeholder="Search by name, SKU, or barcode..."
            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />

          <select
            name="category"
            defaultValue={currentCategory || ""}
            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors border border-slate-700"
          >
            Search
          </button>
        </form>

        {canMutate && (
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              onClick={() => setShowCategoryModal(true)}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
            >
              + Category
            </button>
            <button
              onClick={() => setShowProductModal(true)}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition-colors"
            >
              + Add Product
            </button>
          </div>
        )}
      </div>

      {/* PRODUCTS TABLE */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Products ({products.length})
          </h2>
          <span className="text-xs text-slate-500">
            Tenant: {organizationName} • Role: {userRole}
          </span>
        </div>

        {products.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-900 text-slate-400 flex items-center justify-center mx-auto text-xl border border-slate-800">
              📦
            </div>
            <h3 className="text-base font-medium text-white">No products found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {canMutate
                ? "Get started by adding your first product or category to the catalog."
                : "No products currently available in this organization."}
            </p>
            {canMutate && (
              <button
                onClick={() => setShowProductModal(true)}
                className="mt-2 inline-flex items-center px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
              >
                Create Product
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/70 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-3">Product Name</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Barcode</th>
                  <th className="p-3">Cost Price</th>
                  <th className="p-3">Selling Price</th>
                  <th className="p-3">Unit</th>
                  <th className="p-3">Variants</th>
                  {canMutate && <th className="p-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="p-3 font-sans font-medium text-white">
                      <div>{p.name}</div>
                      {p.brand && <span className="text-[10px] text-slate-500">{p.brand}</span>}
                    </td>
                    <td className="p-3 text-emerald-400 font-semibold">{p.sku}</td>
                    <td className="p-3 font-sans text-slate-400">
                      {p.category?.name ?? "—"}
                    </td>
                    <td className="p-3 text-slate-400">{p.barcode ?? "—"}</td>
                    <td className="p-3 text-slate-400">
                      {String(p.costPrice)}
                    </td>
                    <td className="p-3 text-white font-medium">
                      {String(p.sellingPrice)}
                    </td>
                    <td className="p-3 font-sans capitalize text-slate-400">{p.unit}</td>
                    <td className="p-3 font-sans">
                      {p.variants.length > 0 ? (
                        <div className="space-y-1">
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {p.variants.length} variant{p.variants.length > 1 ? "s" : ""}
                          </span>
                          <div className="text-[10px] text-slate-500 truncate max-w-[120px]">
                            {p.variants.map((v) => v.name).join(", ")}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    {canMutate && (
                      <td className="p-3 text-right font-sans">
                        <button
                          onClick={() => setSelectedProductForVariant(p)}
                          className="px-2 py-1 rounded text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                        >
                          + Variant
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CATEGORIES OVERVIEW */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Categories ({categories.length})
          </h3>
          {canMutate && (
            <button
              onClick={() => setShowCategoryModal(true)}
              className="text-xs text-emerald-400 hover:underline"
            >
              + Add Category
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.length === 0 ? (
            <span className="text-xs text-slate-500 italic">No categories created yet.</span>
          ) : (
            categories.map((c) => (
              <span
                key={c.id}
                className="px-2.5 py-1 rounded-lg text-xs bg-slate-900 border border-slate-800 text-slate-300"
              >
                {c.name}
              </span>
            ))
          )}
        </div>
      </div>

      {/* CREATE CATEGORY MODAL */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Create Category</h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="text-slate-400 hover:text-white text-lg"
              >
                &times;
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
                <label className="block text-xs font-medium text-slate-300">
                  Category Name <span className="text-emerald-400">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Beverages, Bakery, Electronics"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-300">
                  Description
                </label>
                <input
                  name="description"
                  type="text"
                  placeholder="Optional brief description"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCategoryPending}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Create New Product</h3>
              <button
                onClick={() => setShowProductModal(false)}
                className="text-slate-400 hover:text-white text-lg"
              >
                &times;
              </button>
            </div>

            <form
              action={async (formData) => {
                await productFormAction(formData);
                setShowProductModal(false);
              }}
              className="space-y-4"
            >
              <input type="hidden" name="organizationId" value={organizationId} />

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-300">
                  Product Name <span className="text-emerald-400">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Basmati Rice 5kg"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-300">
                    SKU <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    name="sku"
                    type="text"
                    required
                    placeholder="e.g. RICE-001"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono uppercase placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-300">
                    Category
                  </label>
                  <select
                    name="categoryId"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                  <label className="block text-xs font-medium text-slate-300">
                    Barcode
                  </label>
                  <input
                    name="barcode"
                    type="text"
                    placeholder="e.g. 896400012345"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-300">
                    Brand
                  </label>
                  <input
                    name="brand"
                    type="text"
                    placeholder="e.g. Guard, Nestlé"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-300">
                    Unit
                  </label>
                  <input
                    name="unit"
                    type="text"
                    defaultValue="piece"
                    placeholder="piece, kg, pack"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-300">
                    Cost Price
                  </label>
                  <input
                    name="costPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue="0.00"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-300">
                    Selling Price <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    name="sellingPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    defaultValue="0.00"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-300">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={2}
                  placeholder="Optional product details"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProductPending}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white">Add Variant</h3>
                <p className="text-xs text-slate-400">
                  For: <span className="text-emerald-400 font-medium">{selectedProductForVariant.name}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedProductForVariant(null)}
                className="text-slate-400 hover:text-white text-lg"
              >
                &times;
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
                <label className="block text-xs font-medium text-slate-300">
                  Variant Name <span className="text-emerald-400">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Small / Black, 1 Litre Pack"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-300">
                    Variant SKU
                  </label>
                  <input
                    name="sku"
                    type="text"
                    placeholder="e.g. TSHIRT-SM-BLK"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono uppercase placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-300">
                    Variant Barcode
                  </label>
                  <input
                    name="barcode"
                    type="text"
                    placeholder="Optional barcode"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-300">
                    Variant Cost Price
                  </label>
                  <input
                    name="costPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Default parent cost"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-300">
                    Variant Selling Price
                  </label>
                  <input
                    name="sellingPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Default parent price"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedProductForVariant(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVariantPending}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isVariantPending ? "Saving..." : "Save Variant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
