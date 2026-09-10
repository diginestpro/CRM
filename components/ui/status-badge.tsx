import { cn } from "@/lib/utils"

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  sent: "bg-sky-50 text-sky-700 ring-sky-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  draft: "bg-slate-100 text-slate-600 ring-slate-200",
  partial: "bg-amber-50 text-amber-700 ring-amber-200",
  unpaid: "bg-orange-50 text-orange-700 ring-orange-200",
  overdue: "bg-rose-50 text-rose-700 ring-rose-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  expired: "bg-slate-100 text-slate-600 ring-slate-200",
  refunded: "bg-violet-50 text-violet-700 ring-violet-200",
  accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  inactive: "bg-slate-100 text-slate-600 ring-slate-200",
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = (status || "").toLowerCase().trim()
  const style = STATUS_STYLES[key] || "bg-slate-100 text-slate-600 ring-slate-200"
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap",
      style,
      className
    )}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  )
}