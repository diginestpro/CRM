"use client"

import { useEffect, useState } from "react"
import { createClientBrowser } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Loader2, Save, Mail, Server, Lock, User, Send } from "lucide-react"

interface SmtpSettings {
  host: string
  port: string
  username: string
  password: string,
  from_email: string,
  from_name: string,
  encryption: string,
}

export default function EmailSettingsPage() {
  const [smtp, setSmtp] = useState<SmtpSettings>({ host: "", port: "587", username: "", password: "", from_email: "", from_name: "", encryption: "tls" })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/email")
        const data = await res.json()
        if (!res.ok) {
          toast.error("Could not load SMTP settings: " + (data?.error || res.statusText || "Unknown error"))
        } else if (data.success && data.settings) {
          const s = data.settings
          setSmtp({
            host: s.host || "",
            port: String(s.port || "587"),
            username: s.username || "",
            password: s.password || "",
            from_email: s.from_email || "",
            from_name: s.from_name || "",
            encryption: s.encryption || "tls",
          })
        }
      } catch (e: any) {
        console.error("[EmailSettings] load error:", e)
        toast.error("Failed to load SMTP settings: " + (e?.message || "Unknown error"))
      }
      finally { setIsLoading(false) }
    }
    load()
  }, [])

  async function handleSave() {
    setIsSaving(true)
    try {
      const res = await fetch("/api/settings/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(smtp),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save")
      }
      toast.success("SMTP settings saved!")
    } catch (e: any) {
      toast.error(e.message || "Failed to save SMTP settings")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleTest() {
    setIsTesting(true)
    try {
      const res = await fetch("/api/settings/email/test", { method: "POST" })
      const data = await res.json()
      if (data.success) toast.success("Test email sent! Check your inbox.")
      else toast.error(data.error || "Test failed")
    } catch (e: any) {
      toast.error(e.message || "Test failed")
    } finally {
      setIsTesting(false)
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Email & SMTP</h2>
          <p className="text-slate-500">Configure your email server for sending invoices and notifications.</p>
        </div>
        <Button variant="outline" onClick={handleTest} disabled={isTesting}>
          {isTesting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Send Test Email
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>SMTP Server</CardTitle>
          <CardDescription>Outgoing email server configuration.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="host">SMTP Host</Label>
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-slate-400" />
                <Input id="host" value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.gmail.com" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input id="port" type="number" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: e.target.value })} placeholder="587" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="encryption">Encryption</Label>
            <select
              id="encryption"
              value={smtp.encryption}
              onChange={(e) => setSmtp({ ...smtp, encryption: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="tls">TLS (recommended)</option>
              <option value="ssl">SSL</option>
              <option value="none">None</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>SMTP credentials for authentication.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-slate-400" />
              <Input id="username" value={smtp.username} onChange={(e) => setSmtp({ ...smtp, username: e.target.value })} placeholder="your-email@example.com" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-slate-400" />
              <Input id="password" type="password" value={smtp.password} onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} placeholder="••••••••" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>From Address</CardTitle>
          <CardDescription>The address your emails will appear to come from.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="from_name">From Name</Label>
            <Input id="from_name" value={smtp.from_name} onChange={(e) => setSmtp({ ...smtp, from_name: e.target.value })} placeholder="Acme Corporation" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="from_email">From Email</Label>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-slate-400" />
              <Input id="from_email" type="email" value={smtp.from_email} onChange={(e) => setSmtp({ ...smtp, from_email: e.target.value })} placeholder="noreply@acme.com" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save SMTP Settings
        </Button>
      </div>
    </div>
  )
}
