import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import {
  getCategories,
  getProducts,
  CATALOG_MUTATION_ROLES,
  CATALOG_READ_ROLES,
} from "@/lib/catalog";
import { resolveTenantContext, TenantContextError } from "@/lib/tenant-context";
import { AppShell } from "@/components/app-shell";
import { CatalogView } from "./catalog-view";

export const metadata = {
  title: "Product Catalog — POS SaaS",
  description: "Manage products, categories, and variants for your organization.",
};

interface CatalogPageProps {
  searchParams: Promise<{
    org?: string;
    search?: string;
    category?: string;
  }>;
}

export default async function CatalogPage(props: CatalogPageProps) {
  const user = await requireAuth();
  const searchParams = await props.searchParams;

  let tenantContext;
  try {
    tenantContext = await resolveTenantContext(searchParams.org, {
      requireRoles: CATALOG_READ_ROLES,
      actorUser: user,
    });
  } catch (err: unknown) {
    if (err instanceof TenantContextError) {
      if (err.code === "MULTIPLE_ORGS_SPECIFY_REQUIRED") {
        const activeMemberships = user.memberships.filter(
          (m) => m.isActive && m.organization && m.organization.isActive
        );
        return (
          <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-6 shadow-xl text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto text-xl border border-indigo-500/20">
                🏢
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Select Business</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  You belong to multiple businesses. Please choose which catalog you wish to view.
                </p>
              </div>
              <div className="space-y-2 text-left">
                {activeMemberships.map((m) => (
                  <Link
                    key={m.id}
                    href={`/catalog?org=${m.organizationId}`}
                    className="block p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 hover:border-indigo-500 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors"
                  >
                    <div className="font-semibold text-sm text-slate-900 dark:text-white">{m.organization?.name}</div>
                    <div className="text-xs text-slate-500 capitalize">{m.role.name.toLowerCase()}</div>
                  </Link>
                ))}
              </div>
              <div className="pt-2">
                <Link
                  href="/dashboard"
                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  &larr; Return to Dashboard
                </Link>
              </div>
            </div>
          </main>
        );
      }

      if (err.code === "NO_ACTIVE_MEMBERSHIP") {
        return (
          <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center mx-auto text-xl border border-slate-200 dark:border-slate-700">
                🏢
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">No Business Found</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                You need to create or belong to an active organization before accessing the product catalog.
              </p>
              <div className="pt-2">
                <Link
                  href="/onboarding"
                  className="inline-flex items-center px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-950/40"
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
            <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
                ⚠️
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Organization Inaccessible</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                The requested organization could not be found or your membership in it is inactive.
              </p>
              <div className="pt-2">
                <Link
                  href="/catalog"
                  className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  &larr; Return to Catalog
                </Link>
              </div>
            </div>
          </main>
        );
      }

      if (err.code === "UNAUTHORIZED_ROLE") {
        return (
          <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
                🚫
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Catalog Access Denied</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Your role does not have permission to view or manage the product catalog.
              </p>
              <div className="pt-2">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
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
  const canMutate = CATALOG_MUTATION_ROLES.includes(userRole);

  const [categories, products] = await Promise.all([
    getCategories({ organizationId: organization.id, actorUser: user }),
    getProducts({
      organizationId: organization.id,
      search: searchParams.search,
      categoryId: searchParams.category,
      actorUser: user,
    }),
  ]);

  return (
    <AppShell
      organizationId={organization.id}
      organizationName={organization.name}
      userRole={userRole}
      userName={user.name}
      userEmail={user.email}
      breadcrumbs={[
        { label: "Catalog & Stock" },
        { label: "Product Catalog" },
      ]}
    >
      <CatalogView
        organizationId={organization.id}
        organizationName={organization.name}
        userRole={userRole}
        canMutate={canMutate}
        categories={categories}
        products={products}
        currentSearch={searchParams.search}
        currentCategory={searchParams.category}
      />
    </AppShell>
  );
}
