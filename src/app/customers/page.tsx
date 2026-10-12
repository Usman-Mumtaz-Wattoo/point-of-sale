import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import {
  listCustomers,
  CUSTOMER_READ_ROLES,
  CUSTOMER_MUTATION_ROLES,
  CUSTOMER_STATUS_ROLES,
} from "@/lib/customers";
import { SYSTEM_ROLES, type SystemRoleName } from "@/lib/roles";
import { db } from "@/lib/db";
import { resolveTenantContext, TenantContextError } from "@/lib/tenant-context";
import { AppShell } from "@/components/app-shell";
import { CustomerView } from "./customer-view";

export const metadata = {
  title: "Customer Management — POS SaaS",
  description: "Manage registered customers, contact details, and primary branches.",
};

interface CustomersPageProps {
  searchParams: Promise<{
    org?: string;
    search?: string;
    status?: string;
    page?: string;
  }>;
}

export default async function CustomersPage(props: CustomersPageProps) {
  const user = await requireAuth();
  const searchParams = await props.searchParams;
  const requestedOrgId = searchParams.org;

  let tenantContext;
  try {
    tenantContext = await resolveTenantContext(requestedOrgId, {
      requireRoles: CUSTOMER_READ_ROLES,
      actorUser: user,
    });
  } catch (err: unknown) {
    if (err instanceof TenantContextError) {
      if (err.code === "MULTIPLE_ORGS_SPECIFY_REQUIRED") {
        const eligibleMemberships = user.memberships.filter(
          (m) =>
            m.isActive &&
            m.organization.isActive &&
            CUSTOMER_READ_ROLES.includes(m.role.name as SystemRoleName)
        );

        return (
          <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="w-full max-w-xl bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-8 space-y-6 shadow-sm">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto text-xl border border-indigo-200 dark:border-indigo-500/20">
                  🏢
                </div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Select Business</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  You have access to multiple businesses. Please choose which business customers to manage.
                </p>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden">
                {eligibleMemberships.map((m) => (
                  <Link
                    key={m.organizationId}
                    href={`/customers?org=${m.organizationId}`}
                    className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{m.organization.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 capitalize">Role: {m.role.name.toLowerCase()}</div>
                    </div>
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">&rarr;</span>
                  </Link>
                ))}
              </div>

              <div className="text-center pt-2">
                <Link
                  href="/dashboard"
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-400 transition-colors"
                >
                  &larr; Back to Dashboard
                </Link>
              </div>
            </div>
          </main>
        );
      }

      if (err.code === "NO_ACTIVE_MEMBERSHIP") {
        return (
          <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="w-full max-w-xl mx-auto text-center bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-10 space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center mx-auto text-xl border border-slate-200 dark:border-slate-700">
                🏢
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">No Active Business Found</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                You must belong to an active organization to access Customer Management.
              </p>
              <div className="pt-2">
                <Link
                  href="/onboarding"
                  className="inline-flex items-center px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors shadow-sm"
                >
                  Create Your Business &rarr;
                </Link>
              </div>
            </div>
          </main>
        );
      }

      if (err.code === "MEMBERSHIP_NOT_FOUND" || err.code === "INACTIVE_MEMBERSHIP") {
        return (
          <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="w-full max-w-xl mx-auto text-center bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-10 space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto text-xl border border-amber-200 dark:border-amber-500/20">
                ⚠️
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Business Unavailable</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {err.message}
              </p>
              <div className="pt-2">
                <Link
                  href="/customers"
                  className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  Choose Another Business
                </Link>
              </div>
            </div>
          </main>
        );
      }

      if (err.code === "UNAUTHORIZED_ROLE") {
        return (
          <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="w-full max-w-xl mx-auto text-center bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-10 space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-200 dark:border-rose-500/20">
                🚫
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Access Denied</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Your role does not have permission to access Customer Management.
              </p>
              <div className="pt-2">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  &larr; Return to Dashboard
                </Link>
              </div>
            </div>
          </main>
        );
      }
    }
    throw err;
  }

  const organization = tenantContext.organization;
  const userRole = tenantContext.role;
  const canMutate = CUSTOMER_MUTATION_ROLES.includes(userRole);
  const canChangeStatus = CUSTOMER_STATUS_ROLES.includes(userRole);

  // Parse filters
  const page = searchParams.page ? Math.max(1, parseInt(searchParams.page, 10) || 1) : 1;
  const search = searchParams.search?.trim() || undefined;

  let isActiveFilter: boolean | undefined = undefined;
  if (searchParams.status === "active") {
    isActiveFilter = true;
  } else if (searchParams.status === "inactive") {
    isActiveFilter = false;
  }

  // Fetch accessible active branches for primary branch selector
  const isOwner = userRole === SYSTEM_ROLES.OWNER;
  const currentMembership = user.memberships.find(
    (m) => m.organizationId === tenantContext.organizationId
  );
  const branches = isOwner
    ? await db.branch.findMany({
        where: { organizationId: organization.id, isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      })
    : (currentMembership?.branchMemberships ?? [])
        .filter((bm) => bm.branch.isActive)
        .map((bm) => ({
          id: bm.branch.id,
          name: bm.branch.name,
          code: bm.branch.code,
        }));

  // Fetch paginated customers using authoritative business service
  const paginatedResult = await listCustomers(
    {
      page,
      pageSize: 25,
      search,
      isActive: isActiveFilter,
    },
    {
      organizationId: organization.id,
      actorUser: user,
    }
  );

  return (
    <AppShell
      userRole={userRole}
      userName={user.name}
      organizationName={organization.name}
      organizationId={organization.id}
      activePath="/customers"
    >
      <div className="space-y-6">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-2 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Customer Directory
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                {userRole}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Manage client records, tax identifiers, contact profiles, and purchase histories across branches.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/pos?org=${organization.id}`}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-xs"
            >
              Go to POS &rarr;
            </Link>
          </div>
        </div>

        {/* Customer Management View */}
        <CustomerView
          organizationId={organization.id}
          organizationName={organization.name}
          userRole={userRole}
          canMutate={canMutate}
          canChangeStatus={canChangeStatus}
          branches={branches}
          customers={paginatedResult.items}
          pagination={{
            page: paginatedResult.page,
            pageSize: paginatedResult.pageSize,
            total: paginatedResult.total,
            totalPages: paginatedResult.totalPages,
          }}
          currentSearch={search}
          currentStatus={searchParams.status || "all"}
        />
      </div>
    </AppShell>
  );
}
