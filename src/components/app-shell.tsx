"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Receipt,
  RotateCcw,
  Boxes,
  Truck,
  Users,
  Package,
  Settings,
  Building2,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Store,
} from "lucide-react";
import { signOutAction } from "@/app/auth/actions";
import { ThemeToggle } from "@/components/theme-provider";

interface AppShellProps {
  organizationId: string;
  organizationName: string;
  userRole: string;
  userName?: string;
  userEmail?: string;
  title?: string;
  description?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  actions?: React.ReactNode;
  children: React.ReactNode;
  fullWidth?: boolean;
  activePath?: string;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  allowedRoles?: string[];
  badge?: string;
}

export function AppShell({
  organizationId,
  organizationName,
  userRole,
  userName = "User",
  userEmail = "",
  title,
  description,
  breadcrumbs,
  actions,
  children,
  fullWidth = false,
  activePath,
}: AppShellProps) {
  const routerPathname = usePathname();
  const pathname = activePath || routerPathname;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isOwner = userRole === "OWNER";
  const isManager = userRole === "MANAGER";
  const isInventoryManager = userRole === "INVENTORY_MANAGER";
  const isCashier = userRole === "CASHIER";
  const isAccountant = userRole === "ACCOUNTANT";

  // Role-based navigation lists
  const operationalItems: NavItem[] = [
    {
      name: "Dashboard",
      href: `/dashboard?org=${organizationId}`,
      icon: LayoutDashboard,
      allowedRoles: ["OWNER", "MANAGER", "INVENTORY_MANAGER", "CASHIER", "ACCOUNTANT"],
    },
    {
      name: "POS Terminal",
      href: `/pos?org=${organizationId}`,
      icon: ShoppingBag,
      allowedRoles: ["OWNER", "MANAGER", "CASHIER"],
      badge: "Cashier",
    },
    {
      name: "Sales Orders",
      href: `/sales?org=${organizationId}`,
      icon: Receipt,
      allowedRoles: ["OWNER", "MANAGER", "CASHIER", "ACCOUNTANT"],
    },
    {
      name: "Sales Returns",
      href: `/sales/returns?org=${organizationId}`,
      icon: RotateCcw,
      allowedRoles: ["OWNER", "MANAGER", "CASHIER", "ACCOUNTANT"],
    },
  ];

  const inventoryItems: NavItem[] = [
    {
      name: "Product Catalog",
      href: `/catalog?org=${organizationId}`,
      icon: Package,
      allowedRoles: ["OWNER", "MANAGER", "INVENTORY_MANAGER", "CASHIER", "ACCOUNTANT"],
    },
    {
      name: "Stock Inventory",
      href: `/inventory?org=${organizationId}`,
      icon: Boxes,
      allowedRoles: ["OWNER", "MANAGER", "INVENTORY_MANAGER", "CASHIER", "ACCOUNTANT"],
    },
    {
      name: "Purchasing",
      href: `/purchasing?org=${organizationId}`,
      icon: Truck,
      allowedRoles: ["OWNER", "MANAGER", "INVENTORY_MANAGER", "ACCOUNTANT"],
    },
  ];

  const administrativeItems: NavItem[] = [
    {
      name: "Customers",
      href: `/customers?org=${organizationId}`,
      icon: Users,
      allowedRoles: ["OWNER", "MANAGER", "CASHIER", "ACCOUNTANT"],
    },
    {
      name: "Organization Settings",
      href: `/settings?org=${organizationId}`,
      icon: Settings,
      allowedRoles: ["OWNER"],
    },
    {
      name: "Branch Management",
      href: `/settings/branches?org=${organizationId}`,
      icon: Building2,
      allowedRoles: ["OWNER"],
    },
    {
      name: "Staff & Roles",
      href: `/settings/staff?org=${organizationId}`,
      icon: ShieldCheck,
      allowedRoles: ["OWNER"],
    },
  ];

  const filterItems = (items: NavItem[]) =>
    items.filter((item) => !item.allowedRoles || item.allowedRoles.includes(userRole));

  const roleBadgeStyle: Record<string, string> = {
    OWNER: "bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border-indigo-500/20",
    MANAGER: "bg-sky-500/10 text-sky-500 dark:text-sky-400 border-sky-500/20",
    INVENTORY_MANAGER: "bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/20",
    CASHIER: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20",
    ACCOUNTANT: "bg-purple-500/10 text-purple-500 dark:text-purple-400 border-purple-500/20",
  };

  const isCurrentRoute = (href: string) => {
    const routeBase = href.split("?")[0];
    if (routeBase === "/dashboard") {
      return pathname === "/dashboard";
    }
    if (routeBase === "/settings") {
      return pathname === "/settings";
    }
    return pathname.startsWith(routeBase);
  };

  const initials = userName
    ? userName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "U";

  const renderNavGroup = (title: string, items: NavItem[]) => {
    const allowed = filterItems(items);
    if (allowed.length === 0) return null;

    return (
      <div className="space-y-1">
        <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {title}
        </div>
        {allowed.map((item) => {
          const active = isCurrentRoute(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 ${
                active
                  ? "bg-indigo-600/15 text-indigo-400 dark:text-indigo-300 font-semibold border-l-2 border-indigo-500 pl-2.5"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    active ? "text-indigo-400" : "text-slate-400 group-hover:text-slate-200"
                  }`}
                />
                <span className="truncate">{item.name}</span>
              </div>
              {item.badge && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0a0f1d] text-slate-200 select-none">
      {/* Brand & Organization Identity */}
      <div className="p-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-indigo-950/50">
            <Store className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-white truncate tracking-tight">
              {organizationName}
            </h2>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span className="truncate font-mono">Retail Enterprise</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Rail */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {renderNavGroup("Operations", operationalItems)}
        {renderNavGroup("Catalog & Inventory", inventoryItems)}
        {renderNavGroup("Administration", administrativeItems)}
      </nav>

      {/* User Card & Sign Out */}
      <div className="p-3 border-t border-slate-800/80 bg-[#070b14]/70">
        <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-300 font-semibold text-xs flex items-center justify-center border border-indigo-500/30 shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">{userName}</div>
              <div className="text-[11px] text-slate-400 truncate">{userEmail}</div>
            </div>
          </div>

          <form action={signOutAction} className="shrink-0">
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 transition-colors duration-150">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-slate-800/80 fixed inset-y-0 left-0 z-40">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative flex flex-col w-72 max-w-xs bg-[#0a0f1d] shadow-2xl z-10">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800/60"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8 h-16 bg-white/80 dark:bg-[#0b1222]/85 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb / Page Title */}
            <div className="min-w-0">
              {breadcrumbs && breadcrumbs.length > 0 ? (
                <nav className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {breadcrumbs.map((crumb, idx) => (
                    <React.Fragment key={crumb.label}>
                      {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />}
                      {crumb.href ? (
                        <Link
                          href={crumb.href}
                          className="hover:text-slate-900 dark:hover:text-white transition-colors truncate"
                        >
                          {crumb.label}
                        </Link>
                      ) : (
                        <span className="font-semibold text-slate-900 dark:text-white truncate">
                          {crumb.label}
                        </span>
                      )}
                    </React.Fragment>
                  ))}
                </nav>
              ) : title ? (
                <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight truncate">
                  {title}
                </h1>
              ) : null}
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2.5 shrink-0">
            {actions && <div className="flex items-center gap-2">{actions}</div>}

            {/* Organization Info Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Org:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[140px]">
                {organizationName}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  roleBadgeStyle[userRole] || "bg-slate-200 text-slate-700 border-slate-300"
                }`}
              >
                {userRole}
              </span>
            </div>

            {/* Theme Toggle Button */}
            <ThemeToggle />
          </div>
        </header>

        {/* Workspace Canvas */}
        <main
          className={`flex-1 ${
            fullWidth ? "p-3 sm:p-4 lg:p-6" : "p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
