"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, Activity,
  Users,
  FileText,
  ReceiptText,
  CreditCard,
  Settings,
  LogOut,
  Briefcase,
  Package,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClientBrowser } from "@/lib/supabase/client"
import { toast } from "sonner"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },{ name: "Activity", href: "/activity", icon: Activity },
  { name: "Clients", href: "/clients", icon: Users },
  { name: "Services", href: "/services", icon: Package },
  { name: "Quotations", href: "/quotations", icon: FileText },
  { name: "Invoices", href: "/invoices", icon: ReceiptText },
  { name: "Payments", href: "/payments", icon: CreditCard },
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
    if (error) {
      toast.error("Error signing out")
    } else {
      window.location.href = "/login"
    }
  }

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200 bg-white transition-all duration-300 ease-in-out",
          // Mobile
          "transform lg:transform-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          // Desktop width
          collapsed ? "lg:w-20" : "lg:w-64",
          "w-64"
        )}
      >
        {/* Logo header */}
        <div className={cn("flex h-16 items-center border-b border-slate-200 px-4", collapsed ? "lg:justify-center" : "justify-between")}>
          <Link href="/dashboard" className="flex items-center gap-2.5 font-bold text-lg text-blue-600 overflow-hidden">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white flex-shrink-0 shadow-sm">
              <Briefcase className="h-5 w-5" />
            </div>
            {!collapsed && <span className="whitespace-nowrap">NexusCRM</span>}
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

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href))
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.name : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm border border-blue-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  collapsed && "lg:justify-center lg:px-2"
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 flex-shrink-0 transition-colors",
                    isActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"
                  )}
                />
                {!collapsed && <span className="truncate">{item.name}</span>}
                {!collapsed && isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-600" />}
              </Link>
            )
          })}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <div className="hidden lg:block border-t border-slate-200 p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className={cn("w-full text-slate-500 hover:text-slate-900", collapsed ? "justify-center px-2" : "justify-start")}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4 mr-2" /> Collapse</>}
          </Button>
        </div>

        {/* Sign out */}
        <div className="border-t border-slate-200 p-3">
          <Button
            variant="outline"
            className={cn(
              "w-full border-slate-300 text-slate-700 hover:text-red-600 hover:bg-red-50 hover:border-red-200",
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
