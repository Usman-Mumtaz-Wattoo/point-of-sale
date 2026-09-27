import Link from "next/link";
import { Prisma, PurchaseStatus } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SYSTEM_ROLES, type SystemRoleName } from "@/lib/roles";
import {
  listSuppliers,
  SUPPLIER_MUTATION_ROLES,
  SUPPLIER_READ_ROLES,
} from "@/lib/suppliers";
import {
  listPurchases,
  PURCHASE_READ_ROLES,
  PURCHASE_MUTATION_ROLES,
} from "@/lib/purchases";
import { PurchasingView } from "./purchasing-view";
import {
  type AuthorizedBranchDTO,
  type PurchasingPageInitialData,
  type SerializedSupplier,
  type SerializedPurchaseListItem,
  type PurchaseKPIs,
} from "./types";

export const metadata = {
  title: "Purchasing & Vendor Operations — Point of Sale",
  description: "Manage purchase orders, suppliers, and incoming shipments.",
};

interface PurchasingPageProps {
  searchParams: Promise<{
    org?: string;
    tab?: string;
  }>;
}

function serializeData<T>(obj: unknown): T {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) => {
      if (
        value instanceof Prisma.Decimal ||
        (value && typeof value === "object" && "s" in value && "d" in value)
      ) {
        return value.toString();
      }
      return value;
    })
  ) as T;
}

export default async function PurchasingPage(props: PurchasingPageProps) {
  const user = await requireAuth();
  const searchParams = await props.searchParams;

  // Zero-organization handling
  if (user.memberships.length === 0) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
        <div className="max-w-3xl mx-auto text-center bg-slate-950 border border-slate-800 rounded-xl p-12 space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-900 text-slate-400 flex items-center justify-center mx-auto text-xl border border-slate-800">
            🏢
          </div>
          <h1 className="text-xl font-bold text-white">No Business Found</h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            You must belong to an active organization to access the Purchasing management module.
          </p>
          <div className="pt-2">
            <Link
              href="/onboarding"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
            >
              Create Your Business &rarr;
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Resolve requested or default active organization membership
  const requestedOrgId = searchParams.org;
  const activeMembership = requestedOrgId
    ? user.memberships.find((m) => m.organizationId === requestedOrgId && m.isActive) ||
      user.memberships.find((m) => m.isActive) ||
      user.memberships[0]
    : user.memberships.find((m) => m.isActive) || user.memberships[0];

  const organization = activeMembership.organization;
  const userRole = activeMembership.role.name as SystemRoleName;

  // Role Gate: strictly enforce read roles
  if (!PURCHASE_READ_ROLES.includes(userRole) && !SUPPLIER_READ_ROLES.includes(userRole)) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
        <div className="max-w-3xl mx-auto text-center bg-slate-950 border border-slate-800 rounded-xl p-12 space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
            🚫
          </div>
          <h1 className="text-xl font-bold text-white">Access Denied</h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Your role (<strong className="text-slate-200">{userRole}</strong>) does not have
            permission to view purchasing or supplier operations.
          </p>
          <div className="pt-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
            >
              &larr; Return to Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const canMutateSuppliers = SUPPLIER_MUTATION_ROLES.includes(userRole);
  const canMutatePurchases = PURCHASE_MUTATION_ROLES.includes(userRole);

  // Resolve accessible active branches
  const isOwner = userRole === SYSTEM_ROLES.OWNER;
  let authorizedBranches: AuthorizedBranchDTO[] = [];

  if (isOwner) {
    const dbBranches = await db.branch.findMany({
      where: { organizationId: organization.id, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    });
    authorizedBranches = dbBranches;
  } else {
    authorizedBranches = activeMembership.branchMemberships
      .filter((bm) => bm.branch.isActive)
      .map((bm) => ({
        id: bm.branch.id,
        name: bm.branch.name,
        code: bm.branch.code,
      }));
  }

  // Fetch initial data in parallel
  const [
    initialSuppliersRes,
    initialPurchasesRes,
    allActiveSuppliers,
    totalOrders,
    openOrders,
    completedOrders,
    financialSums,
  ] = await Promise.all([
    listSuppliers({
      organizationId: organization.id,
      actorUser: user,
      limit: 25,
      offset: 0,
    }),
    listPurchases({
      organizationId: organization.id,
      actorUser: user,
      limit: 25,
      offset: 0,
    }),
    db.supplier.findMany({
      where: { organizationId: organization.id, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.purchase.count({ where: { organizationId: organization.id } }),
    db.purchase.count({
      where: {
        organizationId: organization.id,
        status: { in: [PurchaseStatus.ORDERED, PurchaseStatus.PARTIALLY_RECEIVED] },
      },
    }),
    db.purchase.count({
      where: {
        organizationId: organization.id,
        status: PurchaseStatus.RECEIVED,
      },
    }),
    db.purchase.aggregate({
      where: {
        organizationId: organization.id,
        status: { not: PurchaseStatus.CANCELLED },
      },
      _sum: {
        totalAmount: true,
        paidAmount: true,
      },
    }),
  ]);

  const totalAmountSum = financialSums._sum.totalAmount || new Prisma.Decimal("0.00");
  const paidAmountSum = financialSums._sum.paidAmount || new Prisma.Decimal("0.00");
  const totalOutstanding = totalAmountSum.sub(paidAmountSum);

  const kpis: PurchaseKPIs = {
    totalOrders,
    openOrders,
    completedOrders,
    totalOutstanding: totalOutstanding.greaterThan(0) ? totalOutstanding.toFixed(2) : "0.00",
  };

  // Map initial purchases
  const mappedPurchases: SerializedPurchaseListItem[] = initialPurchasesRes.purchases.map((p) => {
    const totalAmount = new Prisma.Decimal(p.totalAmount);
    const paidAmount = new Prisma.Decimal(p.paidAmount);
    const balanceDue = totalAmount.sub(paidAmount).toString();

    return {
      id: p.id,
      organizationId: p.organizationId,
      purchaseNumber: p.purchaseNumber,
      branchId: p.branchId,
      supplierId: p.supplierId,
      status: p.status,
      paymentStatus: p.paymentStatus,
      orderDate: p.orderDate.toISOString(),
      expectedDate: p.expectedDate ? p.expectedDate.toISOString() : null,
      subtotal: p.subtotal.toString(),
      discountAmount: p.discountAmount.toString(),
      taxAmount: p.taxAmount.toString(),
      shippingAmount: p.shippingAmount.toString(),
      totalAmount: p.totalAmount.toString(),
      paidAmount: p.paidAmount.toString(),
      balanceDue,
      notes: p.notes,
      createdAt: p.createdAt.toISOString(),
      supplier: {
        id: p.supplier.id,
        name: p.supplier.name,
        contactPerson: p.supplier.contactPerson,
      },
      branch: {
        id: p.branch.id,
        name: p.branch.name,
        code: p.branch.code,
      },
      itemCount: p._count.items,
    };
  });

  const serializedData: PurchasingPageInitialData = {
    userRole,
    canMutateSuppliers,
    canMutatePurchases,
    organizationId: organization.id,
    organizationName: organization.name,
    authorizedBranches,
    initialSuppliers: {
      suppliers: serializeData<SerializedSupplier[]>(initialSuppliersRes.suppliers),
      totalCount: initialSuppliersRes.totalCount,
      limit: initialSuppliersRes.limit,
      offset: initialSuppliersRes.offset,
    },
    initialPurchases: {
      purchases: mappedPurchases,
      totalCount: initialPurchasesRes.totalCount,
      limit: initialPurchasesRes.limit,
      offset: initialPurchasesRes.offset,
      kpis,
    },
    allActiveSuppliersForFilter: allActiveSuppliers,
    defaultTab: searchParams.tab === "suppliers" ? "suppliers" : "purchases",
  };

  return <PurchasingView initialData={serializedData} />;
}
