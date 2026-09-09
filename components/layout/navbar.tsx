"use client"

import { useEffect, useState } from "react"
import { createClientBrowser } from "@/lib/supabase/client"
import { Bell, Menu, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BRAND_NAME_FALLBACK } from "@/lib/branding"

interface NavbarProps {
  onMobileMenuToggle: () => void
  onDesktopSidebarToggle: () => void
}

export function Navbar({ onMobileMenuToggle, onDesktopSidebarToggle }: NavbarProps) {
  const [profile, setProfile] = useState<{ full_name: string; company: { name: string }; role: string } | null>(null)

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClientBrowser()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("full_name, role, companies(name)")
          .eq("id", user.id)
          .maybeSingle()
        if (data) {
          setProfile({
            full_name: data.full_name,
            company: { name: (data.companies as any)?.name },
            role: data.role || "user",
          })
        }
      }
    }
    loadProfile()
  }, [])

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur px-4 lg:px-6">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden text-slate-600"
          onClick={onMobileMenuToggle}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden lg:flex text-slate-500"
          onClick={onDesktopSidebarToggle}
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-slate-900 truncate">
            {profile ? profile.company?.name || BRAND_NAME_FALLBACK : BRAND_NAME_FALLBACK}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden md:block relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search..."
            className="pl-9 w-64 h-9 bg-slate-50 border-slate-200"
          />
        </div>
        <Button variant="ghost" size="icon" className="relative text-slate-600">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500"></span>
        </Button>
        <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-slate-900 leading-tight">{profile?.full_name || "User"}</p>
            <p className="text-xs text-slate-500 capitalize leading-tight">{profile?.role || "User"}</p>
          </div>
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm shadow-sm">
            {profile?.full_name?.charAt(0).toUpperCase() || "U"}
          </div>
        </div>
      </div>
    </header>
  )
}
