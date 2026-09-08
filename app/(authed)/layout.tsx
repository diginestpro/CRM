import { redirect } from "next/navigation"
import { createClientServer } from "@/lib/supabase/server"
import { AppShell } from "@/components/layout/app-shell"

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClientServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Check if user has completed onboarding (has company_id)
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile || !profile.company_id) {
    redirect("/onboarding")
  }

  return <AppShell>{children}</AppShell>
}
