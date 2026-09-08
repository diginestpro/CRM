import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CreditCard, User, Bell, ShieldCheck, Users, Mail, Building2, Activity } from "lucide-react"

const sections = [
  { title: "Payment Settings", description: "Connect Stripe, PayPal, and SafePay.", icon: CreditCard, href: "/settings/payments", color: "text-blue-600", bgColor: "bg-blue-100" },
  { title: "Company Details", description: "Business info, logo, tax & currency.", icon: Building2, href: "/settings/company", color: "text-indigo-600", bgColor: "bg-indigo-100" },
  { title: "Team Members", description: "Manage users and roles.", icon: Users, href: "/settings/team", color: "text-purple-600", bgColor: "bg-purple-100" },
  { title: "Profile Settings", description: "Update your personal info.", icon: User, href: "/settings/profile", color: "text-slate-600", bgColor: "bg-slate-100" },
  { title: "Email & SMTP", description: "Configure email sending.", icon: Mail, href: "/settings/email", color: "text-cyan-600", bgColor: "bg-cyan-100" },
  { title: "Notifications", description: "Manage alerts and updates.", icon: Bell, href: "/settings/notifications", color: "text-orange-600", bgColor: "bg-orange-100" },
  { title: "Security", description: "Passwords and 2FA.", icon: ShieldCheck, href: "/settings/security", color: "text-green-600", bgColor: "bg-green-100" }
]

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div><h2 className="text-3xl font-bold tracking-tight text-slate-900">Settings</h2><p className="text-slate-500">Manage your account and workspace.</p></div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <div key={section.href} className="rounded-xl border bg-white shadow-sm hover:border-slate-300 transition-colors">
            <div className="flex flex-row items-center gap-4 p-6 pb-2">
              <div className={"p-2 rounded-lg " + section.bgColor + " " + section.color}><section.icon className="h-5 w-5" /></div>
              <h3 className="text-lg font-semibold text-slate-900">{section.title}</h3>
            </div>
            <div className="p-6 pt-0">
              <p className="text-sm text-slate-500 mb-4">{section.description}</p>
              <Button variant="outline" size="sm" asChild className="w-full"><Link href={section.href}>Manage</Link></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
