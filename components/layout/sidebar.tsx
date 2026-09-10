"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { BRAND_NAME_FALLBACK } from "@/lib/branding"
import {
  LayoutDashboard,
  Users,
  FileText,
  ReceiptText,
  CreditCard,
  Settings,
  LogOut,
  Package,
  X,
  ChevronLeft,
  ChevronRight,
  Activity,
  Building2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClientBrowser } from "@/lib/supabase/client"
import { toast } from "sonner"

type NavItem = { name: string; href: string; icon: any; badge?: string }

const mainNav: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Activity", href: "/activity", icon: Activity },
]
const salesNav: NavItem[] = [
  { name: "Clients", href: "/clients", icon: Users },
  { name: "Services", href: "/services", icon: Package },
  { name: "Quotations", href: "/quotations", icon: FileText },
  { name: "Invoices", href: "/invoices", icon: ReceiptText },
  { name: "Payments", href: "/payments", icon: CreditCard },
]
const accountNav: NavItem[] = [
  { name: "Settings", href: "/settings", icon: Settings },
]

interface SidebarProps {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
}

export function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }: SidebarProps) {
  const pathname = usePathname()

  async function handleSignOut() {
    const supabase = createClientBrowser()
    const { error } = await supabase.auth.signOut()
    if (error) toast.error("Error signing out")
    else window.location.href = "/login"
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard"
    return pathname === href || pathname?.startsWith(href + "/")
  }

  const renderItem = (item: NavItem) => {
    const active = isActive(item.href)
    return (
      <Link
        key={item.name}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        title={collapsed ? item.name : undefined}
        className={cn(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
          active
            ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white nav-active-glow"
            : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900",
          collapsed && "lg:justify-center lg:px-2"
        )}
      >
        <item.icon
          className={cn(
            "h-[18px] w-[18px] flex-shrink-0 transition-colors",
            active ? "text-white" : "text-slate-400 group-hover:text-slate-700"
          )}
        />
        {!collapsed && <span className="truncate flex-1">{item.name}</span>}
        {!collapsed && item.badge && (
          <span className={cn(
            "text-[10px] font-semibold rounded-full px-1.5 py-0.5",
            active ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-700"
          )}>{item.badge}</span>
        )}
      </Link>
    )
  }

  const SectionLabel = ({ label }: { label: string }) =>
    collapsed ? null : (
      <p className="px-3 pt-5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
    )

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200/80 bg-white transition-all duration-300 ease-out shadow-xl lg:shadow-none",
          "transform lg:transform-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          collapsed ? "lg:w-[76px]" : "lg:w-64",
          "w-72"
        )}
      >
        <div className={cn(
          "flex h-16 items-center border-b border-slate-200/80 px-4",
          collapsed ? "lg:justify-center" : "justify-between"
        )}>
          <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
            <div className="h-9 w-9 rounded-xl bg-brand-gradient flex items-center justify-center text-white flex-shrink-0 shadow-lg shadow-indigo-500/30">
              <Building2 className="h-5 w-5" />
            </div>
            {!collapsed && (
              <span className="font-bold text-[15px] text-slate-900 whitespace-nowrap">{BRAND_NAME_FALLBACK}</span>
            )}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-slate-500"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto no-scrollbar">
          <SectionLabel label="Overview" />
          <div className="space-y-1">{mainNav.map(renderItem)}</div>

          <SectionLabel label="Sales & Billing" />
          <div className="space-y-1">{salesNav.map(renderItem)}</div>

          <SectionLabel label="Account" />
          <div className="space-y-1">{accountNav.map(renderItem)}</div>

        </nav>

        <div className="hidden lg:block border-t border-slate-200/80 p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "w-full text-slate-500 hover:text-slate-900 hover:bg-slate-100",
              collapsed ? "justify-center px-2" : "justify-start"
            )}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : (
              <><ChevronLeft className="h-4 w-4 mr-2" /> Collapse</>
            )}
          </Button>
        </div>

        <div className="border-t border-slate-200/80 p-3">
          <Button
            variant="outline"
            className={cn(
              "w-full border-slate-200 text-slate-700 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-colors",
              collapsed ? "lg:justify-center lg:px-2" : "justify-start"
            )}
            onClick={handleSignOut}
            title={collapsed ? "Sign Out" : undefined}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span className="ml-2 font-medium">Sign Out</span>}
          </Button>
        </div>
      </aside>
    </>
  )
}