"use client"

import { useEffect, useState } from "react"
import { Sidebar } from "./sidebar"
import { Navbar } from "./navbar"

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("sidebar_collapsed")
    if (saved === "true") setCollapsed(true)
  }, [])

  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", String(collapsed))
  }, [collapsed])

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMobileOpen(false)
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Navbar
          onMobileMenuToggle={() => setMobileOpen(!mobileOpen)}
          onDesktopSidebarToggle={() => setCollapsed(!collapsed)}
        />
        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1600px] mx-auto w-full fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}