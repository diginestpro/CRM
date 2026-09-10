import Link from "next/link"
import { cn } from "@/lib/utils"
import { ReactNode } from "react"
import { Plus } from "lucide-react"

interface EmptyStateProps {
  icon?: any
  title: string
  description?: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
  className?: string
  children?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, actionLabel, actionHref, onAction, className, children }: EmptyStateProps) {
  const ActionBtn = (actionHref ? Link : "button") as any
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center py-16 px-6 rounded-2xl border border-dashed border-slate-200 bg-white",
      className
    )}>
      {Icon && (
        <div className="h-14 w-14 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mb-4">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-500 max-w-sm">{description}</p>}
      {actionLabel && (actionHref || onAction) && (
        <ActionBtn
          href={actionHref}
          onClick={onAction}
          className="mt-5 inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand-gradient text-white text-sm font-medium shadow-lg shadow-indigo-500/25 hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          {actionLabel}
        </ActionBtn>
      )}
      {children}
    </div>
  )
}