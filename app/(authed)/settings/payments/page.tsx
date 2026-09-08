"use client"

import { useState, useEffect, Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { Loader2, Save, ShieldCheck, CheckCircle, XCircle, ExternalLink } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

function PaymentsSettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [settings, setSettings] = useState<any>({
    stripe_secret_key: "", stripe_webhook_secret: "", stripe_access_token: "", stripe_account_id: "", stripe_connected: "",
    paypal_client_id: "", paypal_client_secret: "", paypal_access_token: "", paypal_connected: "",
    safepay_api_key: "", safepay_api_url: "",
    next_public_app_url: "",
  })

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings/payments")
        const data = await res.json()
        if (data.success && data.settings) {
          const formatted: any = {}
          // Initialize defaults
          formatted.stripe_secret_key = ""
          formatted.stripe_webhook_secret = ""
          formatted.stripe_access_token = ""
          formatted.stripe_account_id = ""
          formatted.stripe_connected = ""
          formatted.paypal_client_id = ""
          formatted.paypal_client_secret = ""
          formatted.paypal_access_token = ""
          formatted.paypal_connected = ""
          formatted.safepay_api_key = ""
          formatted.safepay_api_url = ""
          formatted.next_public_app_url = ""
          // Populate from DB
          data.settings.forEach((s: any) => { formatted[s.key] = s.value })
          setSettings(formatted)
        }
      } catch (e) { console.error(e) }
      finally { setIsLoading(false) }
    }
    loadSettings()

    // Handle OAuth callback results
    const success = searchParams.get("success")
    const error = searchParams.get("error")
    if (success === "stripe_connected") {
      toast.success("Stripe connected successfully!")
      router.replace("/settings/payments")
    } else if (success === "paypal_connected") {
      toast.success("PayPal connected successfully!")
      router.replace("/settings/payments")
    } else if (error) {
      toast.error("Connection failed: " + error)
      router.replace("/settings/payments")
    }
  }, [searchParams, router])

  async function handleSave() {
    setIsSaving(true)
    try {
      const res = await fetch("/api/settings/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed")
      }
      toast.success("Payment settings saved!")
    } catch (e: any) {
      toast.error(e.message || "Failed")
    } finally {
      setIsSaving(false)
    }
  }

  function handleConnect(gateway: string) {
    window.location.href = "/api/" + gateway + "/connect"
  }

  if (isLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
  }

  const stripeConnected = settings.stripe_connected === "true"
  const paypalConnected = settings.paypal_connected === "true"
  const baseUrl = settings.next_public_app_url || (typeof window !== "undefined" ? window.location.origin : "https://yoursite.com")

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payment Gateways</h1>
          <p className="text-slate-500">Connect payment providers or enter API keys manually.</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Stripe */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Stripe</CardTitle>
                <CardDescription>Cards, Apple Pay, Google Pay</CardDescription>
              </div>
              {stripeConnected ? <CheckCircle className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-slate-300" />}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {stripeConnected ? (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
                Connected to Stripe. Ready to accept payments.
              </div>
            ) : (
              <Button onClick={() => handleConnect("stripe")} className="w-full bg-blue-600 hover:bg-blue-700">
                Connect with Stripe (One Click)
              </Button>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-500 hover:text-slate-700 font-medium">Or enter API keys manually</summary>
              <div className="space-y-2 mt-3 p-3 bg-slate-50 rounded">
                <div><Label>Secret Key</Label><Input type="password" value={settings.stripe_secret_key || ""} onChange={(e) => setSettings({...settings, stripe_secret_key: e.target.value})} placeholder="sk_test_..." /></div>
                <div><Label>Webhook Secret</Label><Input type="password" value={settings.stripe_webhook_secret || ""} onChange={(e) => setSettings({...settings, stripe_webhook_secret: e.target.value})} placeholder="whsec_..." /></div>
              </div>
            </details>
          </CardContent>
        </Card>

        {/* PayPal */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>PayPal</CardTitle>
                <CardDescription>PayPal balance and Credit Cards</CardDescription>
              </div>
              {paypalConnected ? <CheckCircle className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-slate-300" />}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {paypalConnected ? (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
                Connected to PayPal. Ready to accept payments.
              </div>
            ) : (
              <Button onClick={() => handleConnect("paypal")} className="w-full bg-blue-600 hover:bg-blue-700">
                Connect with PayPal (One Click)
              </Button>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-500 hover:text-slate-700 font-medium">Or enter API keys manually</summary>
              <div className="space-y-2 mt-3 p-3 bg-slate-50 rounded">
                <div><Label>Client ID</Label><Input value={settings.paypal_client_id || ""} onChange={(e) => setSettings({...settings, paypal_client_id: e.target.value})} placeholder="Enter Client ID" /></div>
                <div><Label>Client Secret</Label><Input type="password" value={settings.paypal_client_secret || ""} onChange={(e) => setSettings({...settings, paypal_client_secret: e.target.value})} placeholder="Enter Client Secret" /></div>
              </div>
            </details>
          </CardContent>
        </Card>

        {/* SafePay */}
        <Card>
          <CardHeader>
            <CardTitle>SafePay</CardTitle>
            <CardDescription>Pakistani payment gateway with international card support</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>API Key (Public/Secret)</Label>
              <Input type="password" value={settings.safepay_api_key || ""} onChange={(e) => setSettings({...settings, safepay_api_key: e.target.value})} placeholder="pk_test_... or sk_test_..." />
              <p className="text-xs text-slate-500 mt-1">Get from your SafePay merchant dashboard.</p>
            </div>
            <div>
              <Label>API Base URL</Label>
              <Input value={settings.safepay_api_url || ""} onChange={(e) => setSettings({...settings, safepay_api_url: e.target.value})} placeholder="https://api.safepay.com/v1" />
              <p className="text-xs text-slate-500 mt-1">Default: https://api.safepay.com/v1</p>
            </div>
          </CardContent>
        </Card>

        {/* App Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />App Settings</CardTitle>
            <CardDescription>Public URL and webhook callbacks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>App Base URL</Label>
              <Input value={settings.next_public_app_url || ""} onChange={(e) => setSettings({...settings, next_public_app_url: e.target.value})} placeholder="https://crm.yourdomain.com" />
              <p className="text-xs text-slate-500 mt-1">Must start with https:// for live payments.</p>
            </div>
            <div className="text-xs bg-slate-50 p-3 rounded border space-y-1">
              <p className="font-semibold mb-1 flex items-center gap-1"><ExternalLink className="h-3 w-3" /> Webhook Callback URLs (configure in your gateway dashboards):</p>
              <p>Stripe: <code className="text-xs bg-white px-1">{baseUrl}/api/payments/webhook</code></p>
              <p>PayPal: <code className="text-xs bg-white px-1">{baseUrl}/api/payments/webhook</code></p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function PaymentsSettingsPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>}>
      <PaymentsSettingsContent />
    </Suspense>
  )
}
