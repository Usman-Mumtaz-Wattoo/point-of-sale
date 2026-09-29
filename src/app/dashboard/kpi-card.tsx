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
    iconBg: "bg-slate-800/80",
    iconColor: "text-slate-300",
    borderAccent: "border-slate-800 hover:border-slate-700",
    valueColor: "text-white",
  },
  success: {
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    borderAccent: "border-slate-800 hover:border-emerald-500/30",
    valueColor: "text-white",
  },
  warning: {
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-400",
    borderAccent: "border-slate-800 hover:border-amber-500/30",
    valueColor: "text-white",
  },
  danger: {
    iconBg: "bg-rose-500/10",
    iconColor: "text-rose-400",
    borderAccent: "border-slate-800 hover:border-rose-500/30",
    valueColor: "text-white",
  },
  info: {
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400",
    borderAccent: "border-slate-800 hover:border-blue-500/30",
    valueColor: "text-white",
  },
  purple: {
    iconBg: "bg-purple-500/10",
    iconColor: "text-purple-400",
    borderAccent: "border-slate-800 hover:border-purple-500/30",
    valueColor: "text-white",
  },
};

const badgeStyles: Record<string, string> = {
  neutral: "bg-slate-800 text-slate-300 border-slate-700",
  emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  rose: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
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
      className={`relative overflow-hidden rounded-xl bg-slate-950/70 p-5 border transition-all duration-150 ${styles.borderAccent}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {title}
            </span>
            {badge && (
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${badgeStyles[badgeVariant] || badgeStyles.neutral}`}
              >
                {badge}
              </span>
            )}
          </div>

          {loading ? (
            <div className="h-8 w-28 bg-slate-800/80 animate-pulse rounded my-1" />
          ) : (
            <div
              className={`text-2xl font-bold tracking-tight truncate ${styles.valueColor}`}
              title={typeof value === "string" ? value : undefined}
            >
              {value}
            </div>
          )}

          {subtitle && (
            <p className="text-xs text-slate-400/90 truncate">{subtitle}</p>
          )}
        </div>

        <div
          className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-lg border border-slate-800 ${styles.iconBg} ${styles.iconColor}`}
        >
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>
      </div>
    </article>
  );
}
