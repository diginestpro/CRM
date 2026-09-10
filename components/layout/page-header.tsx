import Link from "next/link"
import { cn } from "@/lib/utils"
import { ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ReactNode } from "react"

interface PageHeaderProps {
  title: string
  description?: string
  breadcrumbs?: { label: string; href?: string }[]
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, description, breadcrumbs, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6", className)}>
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1 text-xs text-slate-500 mb-2">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
                {b.href ? (
                  <Link href={b.href} className="hover:text-slate-900 transition-colors">{b.label}</Link>
                ) : (
                  <span className="text-slate-700 font-medium">{b.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 truncate">{title}</h2>
        {description && <p className="text-sm text-slate-500 mt-1 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}

export function PageActionButton({ href, children, variant = "primary", icon: Icon }: { href?: string; children: ReactNode; variant?: "primary" | "outline" | "ghost"; icon?: any }) {
  const Comp: any = href ? Link : "button"
  const cls = cn(
    "h-10 px-4 rounded-xl font-medium text-sm transition-all flex items-center gap-2",
    variant === "primary" && "bg-brand-gradient text-white hover:opacity-90 shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30",
    variant === "outline" && "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300",
    variant === "ghost" && "text-slate-600 hover:bg-slate-100"
  )
  return (
    <Button asChild={!!href} variant="ghost" className={cls}>
      <Comp href={href}>
        {Icon && <Icon className="h-4 w-4" />}
        {children}
      </Comp>
    </Button>
  )
}