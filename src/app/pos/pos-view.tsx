"use client";

import { useState, useTransition } from "react";
import {
  ShoppingBag,
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Building,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Package,
  Layers,
  Store,
  Receipt,
  Loader2,
  Tag,
  LayoutGrid,
  List,
} from "lucide-react";
import { SalePaymentMethod } from "@prisma/client";
import { CustomerSearchResultDTO } from "@/lib/customers";
import { PosCustomerSelector } from "@/components/pos-customer-selector";
import { checkoutSaleAction, CheckoutActionResult } from "./actions";
import { getSaleDetailAction } from "@/app/sales/actions";
import { SaleReceiptModal } from "@/app/sales/sale-receipt-modal";
import { SerializedSaleDetail } from "@/app/sales/types";
import { formatMoney } from "@/lib/currency";
import { getProductImagePath } from "@/lib/product-images";

interface BranchOption {
  id: string;
  name: string;
  code: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  imageUrl?: string | null;
  categoryId?: string | null;
  sellingPrice: string | number;
  variants: Array<{
    id: string;
    name: string;
    sku: string | null;
    sellingPrice: string | number | null;
  }>;
}

interface CartItem {
  productId: string;
  variantId: string | null;
  name: string;
  sku: string | null;
  price: number;
  quantity: number;
}

interface PosViewProps {
  organizationId: string;
  organizationName: string;
  currency?: string;
  userRole: string;
  branches: BranchOption[];
  initialBranchId?: string;
  branchStockMap?: Record<string, Record<string, number>>;
  categories?: CategoryOption[];
  products: ProductOption[];
}

export function PosView({
  organizationId,
  organizationName,
  currency = "PKR",
  branches,
  initialBranchId,
  branchStockMap = {},
  categories = [],
  products,
}: PosViewProps) {
  const [selectedBranchId, setSelectedBranchId] = useState(
    initialBranchId && branches.some((b) => b.id === initialBranchId)
      ? initialBranchId
      : branches[0]?.id || ""
  );
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResultDTO | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>(SalePaymentMethod.CASH);
  const [tenderedAmount, setTenderedAmount] = useState<string>("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isPending, startTransition] = useTransition();

  const [checkoutResult, setCheckoutResult] = useState<CheckoutActionResult | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [receiptSale, setReceiptSale] = useState<SerializedSaleDetail | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);

  // Stock lookup for the selected branch
  const getProductStock = (productId: string, variantId?: string | null): number => {
    const branchStocks = branchStockMap[selectedBranchId] || {};
    if (variantId) {
      return branchStocks[`${productId}:${variantId}`] ?? branchStocks[variantId] ?? 0;
    }
    return branchStocks[productId] ?? 0;
  };

  // Authoritative FBR & PRA Financial Rules:
  // - CASH: 16% FBR Sales Tax
  // - CARD: 8% FBR Sales Tax (digital incentive, alternative NOT additive)
  // - PRA: PKR 1 per finalized invoice, charged exactly once
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const fbrRate =
    paymentMethod === SalePaymentMethod.CARD || paymentMethod === SalePaymentMethod.DIGITAL_WALLET ? 8 : 16;
  const fbrTaxAmount = cart.length > 0 ? Math.round(((subtotal * fbrRate) / 100) * 100) / 100 : 0;
  const praFee = cart.length > 0 ? 1.0 : 0.0;
  const total = cart.length > 0 ? Math.round((subtotal + fbrTaxAmount + praFee) * 100) / 100 : 0;

  const addToCart = (product: ProductOption, variant?: ProductOption["variants"][0]) => {
    const productId = product.id;
    const variantId = variant ? variant.id : null;
    const currentStock = getProductStock(productId, variantId);
    if (currentStock <= 0) {
      return;
    }

    const name = variant ? `${product.name} (${variant.name})` : product.name;
    const sku = variant ? variant.sku || product.sku : product.sku;
    const priceNum =
      variant && variant.sellingPrice !== null
        ? Number(variant.sellingPrice)
        : Number(product.sellingPrice);

    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (i) => i.productId === productId && i.variantId === variantId
      );
      if (existingIndex >= 0) {
        if (prev[existingIndex].quantity >= currentStock) {
          return prev;
        }
        const copy = [...prev];
        copy[existingIndex].quantity += 1;
        return copy;
      }
      return [...prev, { productId, variantId, name, sku, price: priceNum, quantity: 1 }];
    });
  };

  const updateQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const copy = [...prev];
      const item = copy[index];
      const currentStock = getProductStock(item.productId, item.variantId);
      const newQty = item.quantity + delta;
      if (newQty <= 0) {
        return copy.filter((_, i) => i !== index);
      }
      if (newQty > currentStock) {
        return prev;
      }
      copy[index].quantity = newQty;
      return copy;
    });
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCheckout = () => {
    setCheckoutError(null);
    setCheckoutResult(null);

    if (!selectedBranchId) {
      setCheckoutError("Please select a branch terminal for this checkout.");
      return;
    }

    if (cart.length === 0) {
      setCheckoutError("The cart is currently empty. Add at least one item to proceed.");
      return;
    }

    const tenderedNum = tenderedAmount ? parseFloat(tenderedAmount) : total;
    if (isNaN(tenderedNum) || tenderedNum < total) {
      setCheckoutError(`Tendered amount must be at least the total amount (${formatMoney(total, currency)}).`);
      return;
    }

    const payload = {
      branchId: selectedBranchId,
      customerId: selectedCustomer?.id || null,
      items: cart.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
      })),
      payments: [
        {
          paymentMethod,
          amount: total,
          tenderedAmount: tenderedNum,
        },
      ],
    };

    startTransition(async () => {
      try {
        const result = await checkoutSaleAction(payload, organizationId);
        if (result.error) {
          setCheckoutError(result.error);
        } else {
          setCheckoutResult(result);
          setCart([]);
          setTenderedAmount("");
          setSelectedCustomer(null);
        }
      } catch (err: unknown) {
        setCheckoutError(
          err instanceof Error ? err.message : "Checkout failed unexpectedly. Please retry."
        );
      }
    });
  };

  const handleOpenReceipt = async (saleId: string) => {
    setIsLoadingReceipt(true);
    try {
      const res = await getSaleDetailAction(saleId, organizationId);
      if (res.success && res.data) {
        setReceiptSale(res.data);
        setIsReceiptModalOpen(true);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingReceipt(false);
    }
  };

  // Filter products by selected branch stock, category, and search term
  const filteredProducts = products.filter((p) => {
    // In-stock at selected branch filter
    if (onlyInStock && getProductStock(p.id) <= 0) {
      return false;
    }

    // Category filter
    if (selectedCategoryId && p.categoryId !== selectedCategoryId) {
      return false;
    }

    // Search query
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    }

    return true;
  });

  const paymentMethodsList = [
    { id: SalePaymentMethod.CASH, label: "Cash", icon: Banknote },
    { id: SalePaymentMethod.CARD, label: "Card", icon: CreditCard },
    { id: SalePaymentMethod.BANK_TRANSFER, label: "Transfer", icon: Building },
    { id: SalePaymentMethod.DIGITAL_WALLET, label: "Wallet", icon: Wallet },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* LEFT PANEL: Product Grid & Search (7 cols on lg, 8 on xl) */}
      <div className="lg:col-span-7 xl:col-span-8 space-y-4">
        {/* Terminal Controls & Search Header */}
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Terminal Branch Selector */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 shrink-0">
                <Store className="w-3.5 h-3.5 text-indigo-500" />
                Branch:
              </label>
              <select
                value={selectedBranchId}
                onChange={(e) => {
                  const newBranchId = e.target.value;
                  setSelectedBranchId(newBranchId);
                  if (typeof window !== "undefined") {
                    const url = new URL(window.location.href);
                    url.searchParams.set("branch", newBranchId);
                    window.history.replaceState({}, "", url.toString());
                  }
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Search and View Mode Switcher */}
            <div className="flex items-center gap-2 flex-1 sm:max-w-md justify-end">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search products, SKU..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
              </div>

              {/* In-Stock Filter Toggle */}
              <button
                type="button"
                onClick={() => setOnlyInStock(!onlyInStock)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 ${
                  onlyInStock
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
                title="Filter products with stock > 0 at selected branch"
                aria-label="In Stock Only"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">In Stock Only</span>
              </button>

              {/* View Switcher: Grid vs Compact List */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                    viewMode === "grid"
                      ? "bg-white dark:bg-[#0f172a] text-indigo-600 dark:text-indigo-400 shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                  title="Grid View"
                  aria-label="Grid View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-[11px]">Grid</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                    viewMode === "list"
                      ? "bg-white dark:bg-[#0f172a] text-indigo-600 dark:text-indigo-400 shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                  title="Compact List View"
                  aria-label="Compact List View"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-[11px]">List</span>
                </button>
              </div>
            </div>
          </div>

          {/* Dynamic Category Navigation Tabs */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedCategoryId(null)}
                className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedCategoryId === null
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>
                  All Items ({onlyInStock ? products.filter((p) => getProductStock(p.id) > 0).length : products.length})
                </span>
              </button>

              {categories.map((cat) => {
                const count = products.filter((p) => {
                  if (p.categoryId !== cat.id) return false;
                  if (onlyInStock && getProductStock(p.id) <= 0) return false;
                  return true;
                }).length;
                const isSelected = selectedCategoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    <Tag className="w-3 h-3" />
                    <span>{cat.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Product Cards Grid with Local Presentation Photography */}
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xs min-h-[500px]">
          {filteredProducts.length === 0 ? (
            <div className="py-24 text-center space-y-2">
              <Package className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No matching products found
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {selectedCategoryId
                  ? "There are no products listed in this category yet. Try selecting another category or All Items."
                  : "Try adjusting your search query or add items in the Catalog module."}
              </p>
              {selectedCategoryId && (
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId(null)}
                  className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  View All Products &rarr;
                </button>
              )}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-4">
              {filteredProducts.map((p) => {
                const hasVariants = p.variants.length > 0;
                const stock = getProductStock(p.id);
                const isOutOfStock = stock <= 0;
                const imagePath = getProductImagePath(p.sku, p.name, p.imageUrl);

                return (
                  <div
                    key={p.id}
                    className="group bg-slate-50 dark:bg-[#0a0f1d] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between hover:border-indigo-400 dark:hover:border-indigo-500/50 hover:shadow-md transition-all duration-150"
                  >
                    <div>
                      {/* Product Thumbnail Artwork */}
                      <div className="w-full h-32 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-center mb-3 overflow-hidden p-2 group-hover:scale-[1.02] transition-transform">
                        <img
                          src={imagePath}
                          alt={p.name}
                          className="w-full h-full object-contain"
                          loading="lazy"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = "/images/products/fallback-product.svg";
                          }}
                        />
                      </div>

                      {/* Stock Pill Badge */}
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        {stock > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            {stock} in stock
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            Out of Stock (0)
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-slate-400 truncate">
                          {p.sku}
                        </span>
                      </div>

                      {/* Name & Pricing */}
                      <h3 className="font-bold text-slate-900 dark:text-white text-xs line-clamp-2 min-h-[32px]">
                        {p.name}
                      </h3>

                      {!hasVariants && (
                        <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-1">
                          {formatMoney(p.sellingPrice, currency)}
                        </div>
                      )}
                    </div>

                    {/* Action Area */}
                    <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-800/60">
                      {hasVariants ? (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-semibold text-slate-400 block uppercase">
                            Variants:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {p.variants.map((v) => {
                              const vStock = getProductStock(p.id, v.id);
                              const isVOut = vStock <= 0;
                              return (
                                <button
                                  key={v.id}
                                  type="button"
                                  disabled={isVOut}
                                  onClick={() => addToCart(p, v)}
                                  className={`px-2.5 py-1 text-[10px] font-semibold rounded-lg transition-colors border ${
                                    isVOut
                                      ? "opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700"
                                      : "bg-white dark:bg-slate-800 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 cursor-pointer"
                                  }`}
                                  title={isVOut ? `${v.name} is out of stock` : `Add ${v.name} (${vStock} available)`}
                                >
                                  {v.name} ({formatMoney(v.sellingPrice ?? p.sellingPrice, currency)})
                                  <span className="ml-1 text-[9px] opacity-75">{isVOut ? "• Out" : `• ${vStock}`}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isOutOfStock}
                          onClick={() => addToCart(p)}
                          className={`w-full py-2 px-3 rounded-xl font-semibold text-xs transition-colors border flex items-center justify-center gap-1.5 shadow-2xs ${
                            isOutOfStock
                              ? "opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700"
                              : "bg-white dark:bg-slate-800 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 cursor-pointer"
                          }`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isOutOfStock ? "Out of Stock" : "Add to Cart"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* COMPACT LIST VIEW */
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 -my-1">
              {filteredProducts.map((p) => {
                const hasVariants = p.variants.length > 0;
                const stock = getProductStock(p.id);
                const isOutOfStock = stock <= 0;
                const imagePath = getProductImagePath(p.sku, p.name, p.imageUrl);

                return (
                  <div
                    key={p.id}
                    className="group py-2.5 px-2 sm:px-3 rounded-xl flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-[#0a0f1d] transition-colors"
                  >
                    {/* Left: Thumbnail & Details */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-white dark:bg-[#0f172a] border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-center overflow-hidden shrink-0 p-1 group-hover:scale-105 transition-transform">
                        <img
                          src={imagePath}
                          alt={p.name}
                          className="w-full h-full object-contain"
                          loading="lazy"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = "/images/products/fallback-product.svg";
                          }}
                        />
                      </div>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900 dark:text-white text-xs truncate">
                            {p.name}
                          </h3>
                          {stock > 0 ? (
                            <span className="hidden sm:inline-block px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                              {stock} in stock
                            </span>
                          ) : (
                            <span className="hidden sm:inline-block px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
                              Out of Stock (0)
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                          <span>{p.sku}</span>
                          {hasVariants && (
                            <span className="px-1.5 py-0.2 rounded font-sans text-[9px] font-medium bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                              {p.variants.length} variants
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Pricing & Add Action */}
                    <div className="flex items-center gap-3 shrink-0">
                      {!hasVariants && (
                        <div className="text-right">
                          <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                            {formatMoney(p.sellingPrice, currency)}
                          </div>
                        </div>
                      )}

                      {hasVariants ? (
                        <div className="flex flex-wrap items-center justify-end gap-1 max-w-[240px] sm:max-w-[320px]">
                          {p.variants.map((v) => {
                            const vStock = getProductStock(p.id, v.id);
                            const isVOut = vStock <= 0;
                            return (
                              <button
                                key={v.id}
                                type="button"
                                disabled={isVOut}
                                onClick={() => addToCart(p, v)}
                                className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors border shadow-2xs ${
                                  isVOut
                                    ? "opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700"
                                    : "bg-white dark:bg-slate-800 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 cursor-pointer"
                                }`}
                                title={isVOut ? `${v.name} is out of stock` : `Add ${v.name} (${vStock} in stock)`}
                              >
                                {v.name} ({formatMoney(v.sellingPrice ?? p.sellingPrice, currency)})
                                <span className="ml-1 text-[9px] opacity-75">{isVOut ? "• Out" : `• ${vStock}`}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isOutOfStock}
                          onClick={() => addToCart(p)}
                          className={`py-1.5 px-3 rounded-lg font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs ${
                            isOutOfStock
                              ? "opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700"
                              : "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer active:scale-95"
                          }`}
                          title={isOutOfStock ? "Out of Stock at this branch" : "Add to Cart"}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isOutOfStock ? "Out" : "Add"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Order Cart, Taxes & Payment Panel (5 cols on lg, 4 on xl) */}
      <div className="lg:col-span-5 xl:col-span-4 space-y-4">
        {/* Customer Selector Component */}
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 shadow-xs">
          <PosCustomerSelector
            organizationId={organizationId}
            selectedCustomer={selectedCustomer}
            onSelectCustomer={setSelectedCustomer}
            disabled={isPending}
          />
        </div>

        {/* Current Order Cart Container */}
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Active Cart</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                {cart.reduce((sum, item) => sum + item.quantity, 0)} items
              </span>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-xs text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 font-semibold transition-colors cursor-pointer"
              >
                Clear Cart
              </button>
            )}
          </div>

          {/* Success Notification */}
          {checkoutResult && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-200 space-y-2 text-xs m-4 mb-0">
              <div className="font-bold flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" /> Sale Completed Successfully!
              </div>
              <div className="flex justify-between">
                <span>Invoice:</span>
                <strong className="font-mono text-slate-900 dark:text-white">
                  {checkoutResult.invoiceNumber}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Total Paid:</span>
                <strong className="text-slate-900 dark:text-white">
                  {formatMoney(checkoutResult.totalAmount, currency)}
                </strong>
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 pt-1 border-t border-emerald-500/20">
                {checkoutResult.customerId
                  ? `Assigned to customer account #${checkoutResult.customerId}`
                  : "Recorded as anonymous walk-in transaction"}
              </div>
              {checkoutResult.saleId && (
                <button
                  type="button"
                  disabled={isLoadingReceipt}
                  onClick={() => handleOpenReceipt(checkoutResult.saleId!)}
                  className="w-full mt-2 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  {isLoadingReceipt ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Receipt className="w-3.5 h-3.5" />
                  )}
                  <span>View / Print Thermal Receipt</span>
                </button>
              )}
            </div>
          )}

          {/* Error Notification */}
          {checkoutError && (
            <div className="p-3 m-4 mb-0 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{checkoutError}</span>
            </div>
          )}

          {/* Line Items List */}
          <div className="p-4 space-y-3 max-h-[320px] overflow-y-auto">
            {cart.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <ShoppingBag className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Cart is empty</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Select products from the catalog on the left to begin.
                </p>
              </div>
            ) : (
              cart.map((item, index) => (
                <div
                  key={`${item.productId}-${item.variantId || "base"}`}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {item.name}
                    </h4>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5 font-mono">
                      <span>{formatMoney(item.price, currency)} each</span>
                      <span>•</span>
                      <span>Total: {formatMoney(item.price * item.quantity, currency)}</span>
                    </div>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateQuantity(index, -1)}
                      className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-bold text-slate-900 dark:text-white font-mono">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(index, 1)}
                      className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromCart(index)}
                      className="w-6 h-6 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-center justify-center text-rose-500 hover:bg-rose-100 transition-colors ml-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pricing & Tax Summary Calculations */}
          <div className="p-4 bg-slate-50/60 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800/80 space-y-2 text-xs">
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Sub Total:</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                {formatMoney(subtotal, currency)}
              </span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>FBR Sales Tax ({fbrRate}%):</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                +{formatMoney(fbrTaxAmount, currency)}
              </span>
            </div>
            {praFee > 0 && (
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>PRA Invoice Fee:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  +{formatMoney(praFee, currency)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-base font-extrabold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
              <span>Total Payment:</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">
                {formatMoney(total, currency)}
              </span>
            </div>
          </div>

          {/* Payment Method Selector Buttons */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Payment Method:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {paymentMethodsList.map((m) => {
                const Icon = m.icon;
                const isSelected = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-xs font-semibold cursor-pointer ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-950/20"
                        : "bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Cash Tendered Input */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between items-center text-xs">
                <label className="font-semibold text-slate-600 dark:text-slate-300">
                  Amount Received:
                </label>
                <button
                  type="button"
                  onClick={() => setTenderedAmount(total.toFixed(2))}
                  className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Exact ({formatMoney(total, currency)})
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                value={tenderedAmount}
                onChange={(e) => setTenderedAmount(e.target.value)}
                placeholder={formatMoney(total, currency)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Final Action Checkout Button */}
            <button
              type="button"
              disabled={isPending || cart.length === 0}
              onClick={handleCheckout}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-lg shadow-indigo-950/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing Checkout...
                </>
              ) : (
                `Process Transactions • ${formatMoney(total, currency)}`
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Thermal Receipt Preview Modal */}
      <SaleReceiptModal
        isOpen={isReceiptModalOpen}
        sale={receiptSale}
        organizationName={organizationName}
        currency={currency}
        onClose={() => setIsReceiptModalOpen(false)}
      />
    </div>
  );
}
