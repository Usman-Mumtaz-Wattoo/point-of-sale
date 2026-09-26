"use client";

import { useState, useTransition } from "react";
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
  const total = subtotal; // No special tax/discounts applied at UI level for basic checkout

  const addToCart = (product: ProductOption, variant?: ProductOption["variants"][0]) => {
    const productId = product.id;
    const variantId = variant ? variant.id : null;
    const name = variant ? `${product.name} - ${variant.name}` : product.name;
    const sku = variant ? variant.sku || product.sku : product.sku;
    const priceNum = variant && variant.sellingPrice !== null
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
      setCheckoutError("Please select a branch for this sale.");
      return;
    }

    if (cart.length === 0) {
      setCheckoutError("Cart is empty. Add at least one product.");
      return;
    }

    const tenderedNum = tenderedAmount ? parseFloat(tenderedAmount) : total;
    if (isNaN(tenderedNum) || tenderedNum < total) {
      setCheckoutError(`Tendered amount must be at least the total amount ($${total.toFixed(2)}).`);
      return;
    }

    const payload = {
      branchId: selectedBranchId,
      customerId: selectedCustomer?.id || null, // Authoritative: walk-in sends null
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
          setSelectedCustomer(null); // Reset back to Walk-in customer
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* LEFT PANEL: Catalog Selection (7 cols) */}
      <div className="lg:col-span-7 space-y-4">
        {/* Branch Selector Toolbar */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-400">Terminal Branch:</label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-medium focus:border-emerald-500"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          <div className="relative flex-1 sm:max-w-xs">
            <input
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <span className="absolute left-2.5 top-2 text-slate-500 text-xs">🔍</span>
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 min-h-[400px]">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Product Catalog
          </h2>

          {filteredProducts.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs">
              No products found in catalog. Create products in Catalog to begin sales.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredProducts.map((p) => {
                const hasVariants = p.variants.length > 0;
                return (
                  <div
                    key={p.id}
                    className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg flex flex-col justify-between hover:border-slate-700 transition-colors"
                  >
                    <div>
                      <div className="font-medium text-white text-xs truncate">{p.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">SKU: {p.sku}</div>
                      {!hasVariants && (
                        <div className="text-xs font-semibold text-emerald-400 mt-1">
                          ${Number(p.sellingPrice).toFixed(2)}
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800/80">
                      {hasVariants ? (
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-500 block">Select Variant:</span>
                          <div className="flex flex-wrap gap-1">
                            {p.variants.map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => addToCart(p, v)}
                                className="px-2 py-1 text-[10px] rounded bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white transition-colors border border-slate-700"
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
                          className="w-full py-1.5 text-xs font-medium rounded bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white transition-colors"
                        >
                          + Add to Cart
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

      {/* RIGHT PANEL: Cart & Checkout (5 cols) */}
      <div className="lg:col-span-5 space-y-4">
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4 sticky top-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Current Sale
            </h2>
            <span className="text-xs text-slate-400">
              {cart.reduce((s, i) => s + i.quantity, 0)} items
            </span>
          </div>

          {/* Success Banner */}
          {checkoutResult && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 space-y-1 text-xs">
              <div className="font-bold flex items-center gap-1.5 text-sm">
                <span>✓</span> Sale Completed Successfully!
              </div>
              <div>Invoice #: <strong className="font-mono text-white">{checkoutResult.invoiceNumber}</strong></div>
              <div>Total Paid: <strong className="text-white">${checkoutResult.totalAmount}</strong></div>
              {checkoutResult.customerId ? (
                <div className="text-[11px] text-emerald-300">
                  Customer assigned: #{checkoutResult.customerId}
                </div>
              ) : (
                <div className="text-[11px] text-slate-400">Processed as Walk-in Customer</div>
              )}
            </div>
          )}

          {/* Error Banner */}
          {checkoutError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              {checkoutError}
            </div>
          )}

          {/* 1. COMPACT POS CUSTOMER SELECTOR */}
          <PosCustomerSelector
            organizationId={organizationId}
            selectedCustomer={selectedCustomer}
            onSelectCustomer={setSelectedCustomer}
            disabled={isPending}
          />

          {/* 2. Cart Items Table */}
          <div className="space-y-2">
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/80 border border-slate-800 rounded-lg bg-slate-900/40 p-2">
              {cart.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs italic">
                  Cart is empty. Select products from the left.
                </div>
              ) : (
                cart.map((item, idx) => (
                  <div key={`${item.productId}-${item.variantId}-${idx}`} className="py-2 flex items-center justify-between gap-2 text-xs">
                    <div className="truncate flex-1">
                      <div className="font-medium text-white truncate">{item.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        ${item.price.toFixed(2)} x {item.quantity} = ${(item.price * item.quantity).toFixed(2)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQuantity(idx, -1)}
                        className="w-5 h-5 rounded bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center font-bold"
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-xs font-mono">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(idx, 1)}
                        className="w-5 h-5 rounded bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center font-bold"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromCart(idx)}
                        className="text-slate-500 hover:text-rose-400 ml-1 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 3. Totals Summary */}
          <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Subtotal:</span>
              <span className="font-mono text-slate-200">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-slate-800">
              <span>Total Payable:</span>
              <span className="font-mono text-emerald-400">${total.toFixed(2)}</span>
            </div>
          </div>

          {/* 4. Payment Options */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as SalePaymentMethod)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:border-emerald-500"
                >
                  <option value={SalePaymentMethod.CASH}>Cash</option>
                  <option value={SalePaymentMethod.CARD}>Card</option>
                  <option value={SalePaymentMethod.BANK_TRANSFER}>Bank Transfer</option>
                  <option value={SalePaymentMethod.DIGITAL_WALLET}>Digital Wallet</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">Tendered</label>
                <input
                  type="number"
                  step="0.01"
                  value={tenderedAmount}
                  onChange={(e) => setTenderedAmount(e.target.value)}
                  placeholder={`$${total.toFixed(2)}`}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            {/* Complete Sale CTA */}
            <button
              type="button"
              disabled={isPending || cart.length === 0}
              onClick={handleCheckout}
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-lg shadow-emerald-950/40 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isPending ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Processing Checkout...
                </>
              ) : (
                `Complete Sale • $${total.toFixed(2)}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
