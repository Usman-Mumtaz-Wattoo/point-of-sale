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
} from "lucide-react";
import { SalePaymentMethod } from "@prisma/client";
import { CustomerSearchResultDTO } from "@/lib/customers";
import { PosCustomerSelector } from "@/components/pos-customer-selector";
import { checkoutSaleAction, CheckoutActionResult } from "./actions";

interface BranchOption {
  id: string;
  name: string;
  code: string;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
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
  userRole: string;
  branches: BranchOption[];
  products: ProductOption[];
}

export function PosView({
  organizationId,
  branches,
  products,
}: PosViewProps) {
  const [selectedBranchId, setSelectedBranchId] = useState(branches[0]?.id || "");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResultDTO | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>(SalePaymentMethod.CASH);
  const [tenderedAmount, setTenderedAmount] = useState<string>("");
  const [productSearch, setProductSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const [checkoutResult, setCheckoutResult] = useState<CheckoutActionResult | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Cart calculations
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = subtotal;

  const addToCart = (product: ProductOption, variant?: ProductOption["variants"][0]) => {
    const productId = product.id;
    const variantId = variant ? variant.id : null;
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
      const newQty = copy[index].quantity + delta;
      if (newQty <= 0) {
        return copy.filter((_, i) => i !== index);
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
      setCheckoutError(`Tendered amount must be at least the total amount ($${total.toFixed(2)}).`);
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

  const filteredProducts = products.filter((p) => {
    if (!productSearch.trim()) return true;
    const q = productSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
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
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-indigo-500" />
                Branch:
              </label>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Product Search */}
            <div className="relative flex-1 sm:max-w-xs">
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products, SKU..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
            </div>
          </div>

          {/* Quick Filter Pills (Inspired by Reference 1) */}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/60 overflow-x-auto text-xs pb-0.5">
            <button
              type="button"
              onClick={() => setProductSearch("")}
              className={`px-3 py-1 rounded-full font-semibold shrink-0 transition-colors ${
                !productSearch
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              All Items ({products.length})
            </button>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="text-[11px] text-slate-400 shrink-0 font-medium">
              Showing {filteredProducts.length} items
            </span>
          </div>
        </div>

        {/* Product Cards Grid (Matching Reference Screenshot 1) */}
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xs min-h-[500px]">
          {filteredProducts.length === 0 ? (
            <div className="py-24 text-center space-y-2">
              <Package className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No matching products found
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Try adjusting your search query or add items in the Catalog module.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-4">
              {filteredProducts.map((p) => {
                const hasVariants = p.variants.length > 0;
                return (
                  <div
                    key={p.id}
                    className="group bg-slate-50 dark:bg-[#0a0f1d] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between hover:border-indigo-400 dark:hover:border-indigo-500/50 hover:shadow-md transition-all duration-150"
                  >
                    <div>
                      {/* Product Thumbnail Placeholder */}
                      <div className="w-full h-28 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-center mb-3 group-hover:scale-[1.02] transition-transform">
                        <Package className="w-8 h-8 text-indigo-400 opacity-60" />
                      </div>

                      {/* Stock Pill Badge */}
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          In Stock
                        </span>
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
                          ${Number(p.sellingPrice).toFixed(2)}
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
                            {p.variants.map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => addToCart(p, v)}
                                className="px-2.5 py-1 text-[10px] font-semibold rounded-lg bg-white dark:bg-slate-800 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 text-slate-700 dark:text-slate-200 transition-colors border border-slate-200 dark:border-slate-700"
                              >
                                {v.name} (${Number(v.sellingPrice ?? p.sellingPrice).toFixed(2)})
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToCart(p)}
                          className="w-full py-2 text-xs font-bold rounded-xl bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 transition-all flex items-center justify-center gap-1.5 shadow-2xs"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add To Cart
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

      {/* RIGHT PANEL: Cart & Checkout Summary (5 cols on lg, 4 on xl) */}
      <div className="lg:col-span-5 xl:col-span-4 space-y-4">
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 space-y-4 sticky top-20 shadow-md">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                Order Details
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
              {cart.reduce((s, i) => s + i.quantity, 0)} items
            </span>
          </div>

          {/* Success Notification */}
          {checkoutResult && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-200 space-y-1.5 text-xs">
              <div className="font-bold flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" /> Sale Completed Successfully!
              </div>
              <div className="flex justify-between">
                <span>Invoice:</span>
                <strong className="font-mono text-slate-900 dark:text-white">{checkoutResult.invoiceNumber}</strong>
              </div>
              <div className="flex justify-between">
                <span>Total Paid:</span>
                <strong className="text-slate-900 dark:text-white">${checkoutResult.totalAmount}</strong>
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 pt-1 border-t border-emerald-500/20">
                {checkoutResult.customerId
                  ? `Assigned to customer account #${checkoutResult.customerId}`
                  : "Recorded as anonymous walk-in transaction"}
              </div>
            </div>
          )}

          {/* Error Notification */}
          {checkoutError && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{checkoutError}</span>
            </div>
          )}

          {/* Customer Selection Widget */}
          <PosCustomerSelector
            organizationId={organizationId}
            selectedCustomer={selectedCustomer}
            onSelectCustomer={setSelectedCustomer}
            disabled={isPending}
          />

          {/* Cart Item Rows with Steppers */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Selected Products
            </div>
            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/40 p-2">
              {cart.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs italic">
                  Cart is empty. Select products from the left to begin sale.
                </div>
              ) : (
                cart.map((item, idx) => (
                  <div
                    key={`${item.productId}-${item.variantId}-${idx}`}
                    className="py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 dark:text-white truncate">
                        {item.name}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        ${item.price.toFixed(2)} ea • ${(item.price * item.quantity).toFixed(2)}
                      </div>
                    </div>

                    {/* Stepper buttons (Matching Reference 1) */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQuantity(idx, -1)}
                        className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-7 text-center font-mono font-bold text-slate-900 dark:text-white">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(idx, 1)}
                        className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromCart(idx)}
                        className="p-1 rounded text-slate-400 hover:text-rose-500 transition-colors ml-1"
                        aria-label="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Order Pricing Breakdown */}
          <div className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Sub Total:</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                ${subtotal.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Discount (0%):</span>
              <span className="font-mono text-slate-500">$0.00</span>
            </div>
            <div className="flex justify-between text-base font-extrabold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
              <span>Total Payment:</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">
                ${total.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Payment Method Selector (Pills) */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                Payment Method
              </label>
              <div className="grid grid-cols-2 gap-2">
                {paymentMethodsList.map((pm) => {
                  const Icon = pm.icon;
                  const active = paymentMethod === pm.id;
                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setPaymentMethod(pm.id)}
                      className={`flex items-center gap-2 p-2 rounded-xl text-xs font-semibold border transition-all ${
                        active
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{pm.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tendered Amount */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  Tendered Amount
                </label>
                <button
                  type="button"
                  onClick={() => setTenderedAmount(total.toFixed(2))}
                  className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Exact (${total.toFixed(2)})
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                value={tenderedAmount}
                onChange={(e) => setTenderedAmount(e.target.value)}
                placeholder={`$${total.toFixed(2)}`}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Main Violet/Indigo Checkout Action (Inspired by Reference 1) */}
            <button
              type="button"
              disabled={isPending || cart.length === 0}
              onClick={handleCheckout}
              className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs uppercase tracking-wider transition-all duration-150 shadow-lg shadow-indigo-600/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Processing Checkout...
                </>
              ) : (
                `Process Transactions • $${total.toFixed(2)}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
