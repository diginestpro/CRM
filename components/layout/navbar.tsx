"use client"

import { useEffect, useState, useRef } from "react"
import { createClientBrowser } from "@/lib/supabase/client"
import { Bell, Menu, Search, ChevronDown, LogOut, User, Settings as SettingsIcon, CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BRAND_NAME_FALLBACK } from "@/lib/branding"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface NavbarProps {
  onMobileMenuToggle: () => void
  onDesktopSidebarToggle: () => void
}

export function Navbar({ onMobileMenuToggle, onDesktopSidebarToggle }: NavbarProps) {
  const [profile, setProfile] = useState<{ full_name: string; email: string; company: { name: string }; role: string } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClientBrowser()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("full_name, role, email, companies(name)")
          .eq("id", user.id)
          .maybeSingle()
        if (data) {
          setProfile({
            full_name: data.full_name,
            email: data.email || user.email || "",
            company: { name: (data.companies as any)?.name },
            role: data.role || "user",
          })
        }
      }
    }
    loadProfile()
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [menuOpen])

  async function handleSignOut() {
    const supabase = createClientBrowser()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const greeting = (() => {
    if (!now) return "Welcome"
    const h = now.getHours()
    if (h < 5) return "Good night"
    if (h < 12) return "Good morning"
    if (h < 18) return "Good afternoon"
    return "Good evening"
  })()

  const initials = (profile?.full_name || "U").trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase() || "U"

  return (
    <header className="sticky top-0 z-30 h-16 glass border-b border-slate-200/70 px-3 sm:px-5 lg:px-7 flex items-center gap-3">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden text-slate-600 hover:bg-slate-100"
        onClick={onMobileMenuToggle}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hidden lg:flex text-slate-500 hover:bg-slate-100"
        onClick={onDesktopSidebarToggle}
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="hidden md:flex flex-col leading-tight min-w-0">
        <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
          {greeting}{profile?.full_name ? "," : ""}
        </span>
        <h1 className="text-[15px] font-semibold text-slate-900 truncate max-w-[260px]">
          {profile?.full_name || BRAND_NAME_FALLBACK}
        </h1>
      </div>

      <div className="flex-1" />

      <div className="hidden md:block relative w-full max-w-md">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <Input
          placeholder="Search clients, invoices..."
          className="pl-9 pr-16 h-10 bg-white border-slate-200 focus-visible:border-indigo-300 focus-visible:ring-2 focus-visible:ring-indigo-100 rounded-xl"
        />
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden lg:flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
          Ctrl K
        </kbd>
      </div>

      <Button variant="ghost" size="icon" className="relative text-slate-600 hover:bg-slate-100" aria-label="Notifications">
        <Bell className="h-5 w-5" />
        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
      </Button>

      <div ref={menuRef} className="relative">
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="flex items-center gap-2.5 rounded-full hover:bg-slate-100 pl-1 pr-2 py-1 transition-colors"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <div className="h-8 w-8 rounded-full bg-brand-gradient flex items-center justify-center text-white font-semibold text-xs shadow-sm shadow-indigo-500/30">
            {initials}
          </div>
          <div className="hidden sm:flex flex-col text-left leading-tight">
            <span className="text-sm font-semibold text-slate-900 truncate max-w-[120px]">{profile?.full_name || "User"}</span>
            <span className="text-[10px] text-slate-500 capitalize">{profile?.role || "User"}</span>
          </div>
          <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform hidden sm:block", menuOpen && "rotate-180")} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50 p-1.5 fade-in origin-top-right">
            <div className="px-3 py-3 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-900 truncate">{profile?.full_name || "User"}</p>
              <p className="text-xs text-slate-500 truncate">{profile?.email}</p>
              <span className="inline-flex items-center mt-1.5 text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 bg-indigo-50 text-indigo-700 capitalize">
                {profile?.role || "User"}
              </span>
            </div>
            <div className="py-1">
              <MenuItem href="/settings/profile" icon={User}>Profile</MenuItem>
              <MenuItem href="/settings" icon={SettingsIcon}>Settings</MenuItem>
              <MenuItem href="/payments" icon={CreditCard}>Payments</MenuItem>
            </div>
            <div className="border-t border-slate-100 pt-1">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              >
                <LogOut className="h-4 w-4" /> Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}

function MenuItem({ href, icon: Icon, children }: { href: string; icon: any; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
    >
      <Icon className="h-4 w-4 text-slate-400" />
      {children}
    </Link>
  )
}