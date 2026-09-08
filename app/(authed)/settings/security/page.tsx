import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"

export default function SecurityPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Security</h2>
          <p className="text-slate-500">Manage passwords and two-factor authentication.</p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming Soon</CardTitle>
          <CardDescription>This settings section is under development.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Features for Security will be available soon.</p>
        </CardContent>
      </Card>
    </div>
  )
}
