import React from "react";
import type { LucideIcon } from "lucide-react";

export type KpiCardVariant = "default" | "success" | "warning" | "danger" | "info" | "purple";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: KpiCardVariant;
  loading?: boolean;
  badge?: string;
  badgeVariant?: "neutral" | "emerald" | "amber" | "rose" | "blue";
  ariaLabel?: string;
}

const variantStyles: Record<
  KpiCardVariant,
  {
    iconBg: string;
    iconColor: string;
    borderAccent: string;
    valueColor: string;
  }
> = {
  default: {
    iconBg: "bg-slate-100 text-slate-600 dark:bg-slate-800/80 dark:text-slate-300",
    iconColor: "",
    borderAccent: "border-slate-200/80 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700",
    valueColor: "text-slate-900 dark:text-white",
  },
  success: {
    iconBg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20",
    iconColor: "",
    borderAccent: "border-slate-200/80 hover:border-emerald-500/30 dark:border-slate-800 dark:hover:border-emerald-500/30",
    valueColor: "text-slate-900 dark:text-white",
  },
  warning: {
    iconBg: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20",
    iconColor: "",
    borderAccent: "border-slate-200/80 hover:border-amber-500/30 dark:border-slate-800 dark:hover:border-amber-500/30",
    valueColor: "text-slate-900 dark:text-white",
  },
  danger: {
    iconBg: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20",
    iconColor: "",
    borderAccent: "border-slate-200/80 hover:border-rose-500/30 dark:border-slate-800 dark:hover:border-rose-500/30",
    valueColor: "text-slate-900 dark:text-white",
  },
  info: {
    iconBg: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20",
    iconColor: "",
    borderAccent: "border-slate-200/80 hover:border-indigo-500/30 dark:border-slate-800 dark:hover:border-indigo-500/30",
    valueColor: "text-slate-900 dark:text-white",
  },
  purple: {
    iconBg: "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20",
    iconColor: "",
    borderAccent: "border-slate-200/80 hover:border-purple-500/30 dark:border-slate-800 dark:hover:border-purple-500/30",
    valueColor: "text-slate-900 dark:text-white",
  },
};

const badgeStyles: Record<string, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  amber: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
  rose: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20",
  blue: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20",
};

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
  loading = false,
  badge,
  badgeVariant = "neutral",
  ariaLabel,
}: KpiCardProps) {
  const styles = variantStyles[variant];

  return (
    <article
      aria-label={ariaLabel || title}
      className={`relative overflow-hidden rounded-2xl bg-white dark:bg-[#0f172a] p-5 border shadow-xs transition-all duration-150 ${styles.borderAccent}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {title}
            </span>
            {badge && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeStyles[badgeVariant] || badgeStyles.neutral}`}
              >
                {badge}
              </span>
            )}
          </div>

          {loading ? (
            <div className="h-8 w-28 bg-slate-200 dark:bg-slate-800/80 animate-pulse rounded my-1" />
          ) : (
            <div
              className={`text-2xl font-bold tracking-tight truncate ${styles.valueColor}`}
              title={typeof value === "string" ? value : undefined}
            >
              {value}
            </div>
          )}

          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>
          )}
        </div>

        <div
          className={`shrink-0 flex items-center justify-center w-11 h-11 rounded-xl shadow-xs ${styles.iconBg}`}
        >
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>
      </div>
    </article>
  );
}
