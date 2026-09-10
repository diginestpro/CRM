import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { ReactNode } from "react"

interface StatCardProps {
  title: string
  value: string | number
  description?: string
  icon: any
  iconClassName?: string
  trend?: { value: string; direction: "up" | "down" | "flat" }
  className?: string
  footer?: ReactNode
}

export function StatCard({ title, value, description, icon: Icon, iconClassName, trend, className, footer }: StatCardProps) {
  const TrendIcon = trend?.direction === "up" ? TrendingUp : trend?.direction === "down" ? TrendingDown : Minus
  const trendColor =
    trend?.direction === "up" ? "text-emerald-600 bg-emerald-50" :
    trend?.direction === "down" ? "text-rose-600 bg-rose-50" :
    "text-slate-500 bg-slate-100"

  return (
    <div className={cn(
      "group relative bg-white rounded-2xl border border-slate-200/80 p-5 lift overflow-hidden",
      className
    )}>
      <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br from-indigo-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</p>
          <p className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900 truncate">{value}</p>
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
        <div className={cn(
          "h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0",
          iconClassName || "bg-indigo-50 text-indigo-600"
        )}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {(trend || footer) && (
        <div className="relative mt-4 flex items-center justify-between">
          {trend && (
            <span className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full", trendColor)}>
              <TrendIcon className="h-3 w-3" />
              {trend.value}
            </span>
          )}
          {footer && <div className="text-xs text-slate-500">{footer}</div>}
        </div>
      )}
    </div>
  )
}