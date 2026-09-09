"use client"

import { useState, useEffect, Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { Loader2, Save, ShieldCheck, CheckCircle, XCircle, ExternalLink, Copy, Zap } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

type GatewayName = "stripe" | "paypal" | "safepay"

interface GatewayView {
  is_active: boolean
  api_key: string
  secret_key: string
  webhook_secret: string
  mode: string
  display_name: string
  description: string
  api_url: string
  last_verified_at: string | null
  last_status: string | null
  last_message: string | null
}

interface AppSettingsView {
  app_url: string
  default_currency_code: string
  default_timezone: string
  brand_name: string
  company_website: string
}

const DEFAULT_GATEWAY: GatewayView = {
  is_active: false,
  api_key: "",
  secret_key: "",
  webhook_secret: "",
  mode: "",
  display_name: "",
  description: "",
  api_url: "",
  last_verified_at: null,
  last_status: null,
  last_message: null,
}

const DEFAULT_APP: AppSettingsView = {
  app_url: "",
  default_currency_code: "USD",
  default_timezone: "UTC",
  brand_name: "",
  company_website: "",
}

const TIMEZONES = [
  "UTC",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
]

const CURRENCIES = [
  ["USD", "US Dollar ($)"],
  ["EUR", "Euro (\u20ac)"],
  ["GBP", "British Pound (\u00a3)"],
  ["PKR", "Pakistani Rupee (Rs)"],
  ["AED", "UAE Dirham"],
  ["SAR", "Saudi Riyal"],
  ["CAD", "Canadian Dollar (C$)"],
  ["AUD", "Australian Dollar (A$)"],
]

function PaymentsSettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [testingKey, setTestingKey] = useState<string | null>(null)

  const [gateways, setGateways] = useState<Record<GatewayName, GatewayView>>({
    stripe: { ...DEFAULT_GATEWAY, mode: "test" },
    paypal: { ...DEFAULT_GATEWAY, mode: "sandbox" },
    safepay: { ...DEFAULT_GATEWAY, mode: "sandbox" },
  })
  const [appSettings, setAppSettings] = useState<AppSettingsView>(DEFAULT_APP)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/payments")
        const data = await res.json()
        if (data.success && data.settings) {
          const s = data.settings
          const loaded: any = { ...gateways }
          for (const name of ["stripe", "paypal", "safepay"] as GatewayName[]) {
            if (s[name]) loaded[name] = { ...DEFAULT_GATEWAY, ...s[name] }
          }
          setGateways(loaded)
          if (s.app_settings) setAppSettings({ ...DEFAULT_APP, ...s.app_settings })
        }
      } catch (e) { console.error(e) }
      finally { setIsLoading(false) }
    }
    load()

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router])

  async function saveSection(key: string, payload: any) {
    setSavingKey(key)
    try {
      const res = await fetch("/api/settings/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Save failed")
      toast.success(`${key} saved`)
    } catch (e: any) {
      toast.error(e.message || "Save failed")
    } finally {
      setSavingKey(null)
    }
  }

  async function testConnection(gateway: GatewayName) {
    setTestingKey(gateway)
    try {
      const res = await fetch("/api/payments/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateway }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(`Connected (${data.environment}): ${data.message}`)
      } else {
        toast.error(`Failed (${data.environment}): ${data.message}`)
      }
      // Refresh to show latest status
      const r = await fetch("/api/settings/payments")
      const j = await r.json()
      if (j.success && j.settings?.[gateway]) {
        setGateways(prev => ({ ...prev, [gateway]: { ...DEFAULT_GATEWAY, ...j.settings[gateway] } }))
      }
    } catch (e: any) {
      toast.error(e.message || "Test failed")
    } finally {
      setTestingKey(null)
    }
  }

  function copyWebhookUrl() {
    const url = `${appSettings.app_url || (typeof window !== "undefined" ? window.location.origin : "")}/api/payments/callback`
    navigator.clipboard.writeText(url)
    toast.success("Webhook URL copied")
  }

  if (isLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
  }

  function updateGateway(name: GatewayName, patch: Partial<GatewayView>) {
    setGateways(prev => ({ ...prev, [name]: { ...prev[name], ...patch } }))
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payment Gateways</h1>
        <p className="text-slate-500">Connect payment providers or enter API keys manually. Test each connection before going live.</p>
      </div>

      {/* STRIPE */}
      <GatewayCard
        title="Stripe"
        description="Cards, Apple Pay, Google Pay"
        gateway="stripe"
        view={gateways.stripe}
        modes={[{ value: "test", label: "Test mode" }, { value: "live", label: "Live mode" }]}
        fields={[
          { key: "api_key", label: "Publishable Key (api_key)", placeholder: "pk_test_... or pk_live_..." },
          { key: "secret_key", label: "Secret Key", placeholder: "sk_test_... or sk_live_...", type: "password" },
          { key: "webhook_secret", label: "Webhook Signing Secret", placeholder: "whsec_...", type: "password" },
        ]}
        savingKey={savingKey}
        testingKey={testingKey}
        onChange={(patch) => updateGateway("stripe", patch)}
        onSave={() => saveSection("Stripe", { stripe: gateways.stripe })}
        onTest={() => testConnection("stripe")}
      />

      {/* PAYPAL */}
      <GatewayCard
        title="PayPal"
        description="PayPal balance and Credit Cards"
        gateway="paypal"
        view={gateways.paypal}
        modes={[{ value: "sandbox", label: "Sandbox" }, { value: "live", label: "Live" }]}
        fields={[
          { key: "api_key", label: "Client ID (api_key)", placeholder: "AYxxxxxxxxxxxxxxxxxxxx" },
          { key: "secret_key", label: "Client Secret", placeholder: "EXxxxxxxxxxxxxxxxxxxxx", type: "password" },
          { key: "display_name", label: "Display Name", placeholder: "PayPal" },
          { key: "description", label: "Description", placeholder: "Pay with PayPal or credit card" },
        ]}
        savingKey={savingKey}
        testingKey={testingKey}
        onChange={(patch) => updateGateway("paypal", patch)}
        onSave={() => saveSection("PayPal", { paypal: gateways.paypal })}
        onTest={() => testConnection("paypal")}
      />

      {/* SAFEPAY */}
      <GatewayCard
        title="SafePay"
        description="Pakistani payment gateway with international card support"
        gateway="safepay"
        view={gateways.safepay}
        modes={[{ value: "sandbox", label: "Sandbox" }, { value: "production", label: "Production" }]}
        fields={[
          { key: "api_key", label: "Public / Merchant API Key", placeholder: "pk_test_... or pk_live_..." },
          { key: "secret_key", label: "Secret Key", placeholder: "sk_test_... or sk_live_...", type: "password" },
          { key: "webhook_secret", label: "Webhook Secret (optional)", placeholder: "Paste webhook secret", type: "password" },
          { key: "api_url", label: "API Base URL", placeholder: "https://sandbox.api.getsafepay.com" },
        ]}
        savingKey={savingKey}
        testingKey={testingKey}
        onChange={(patch) => updateGateway("safepay", patch)}
        onSave={() => saveSection("SafePay", { safepay: gateways.safepay })}
        onTest={() => testConnection("safepay")}
      />

      {/* APP SETTINGS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />App Settings</CardTitle>
          <CardDescription>Public URL, currency and webhook callbacks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>App Base URL</Label>
            <Input
              value={appSettings.app_url}
              onChange={(e) => setAppSettings({ ...appSettings, app_url: e.target.value })}
              placeholder="https://crm.diginest.pro"
            />
            <p className="text-xs text-slate-500 mt-1">Must start with https://. Used as the SafePay callback host.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Default Currency</Label>
              <select
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={appSettings.default_currency_code}
                onChange={(e) => setAppSettings({ ...appSettings, default_currency_code: e.target.value })}
              >
                {CURRENCIES.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
              </select>
            </div>
            <div>
              <Label>Default Timezone</Label>
              <select
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={appSettings.default_timezone}
                onChange={(e) => setAppSettings({ ...appSettings, default_timezone: e.target.value })}
              >
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
            <div className="md:col-span-2">
              <Label>Brand Name</Label>
              <Input
                value={appSettings.brand_name}
                onChange={(e) => setAppSettings({ ...appSettings, brand_name: e.target.value })}
                placeholder="Leave empty to use your company name"
              />
              <p className="text-xs text-slate-500 mt-1">Displayed in the navbar, sidebar, emails, and footers. Falls back to your company name when empty.</p>
            </div>
            <div className="md:col-span-2">
              <Label>Company Website</Label>
              <Input
                value={appSettings.company_website}
                onChange={(e) => setAppSettings({ ...appSettings, company_website: e.target.value })}
                placeholder="https://example.com"
              />
              <p className="text-xs text-slate-500 mt-1">Used in the email footer (Refund Policy / Terms links) and the pay page "Powered by" link. Falls back to https://diginest.pro when empty.</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => saveSection("App Settings", { app_settings: appSettings })} disabled={savingKey === "App Settings"} className="bg-blue-600 hover:bg-blue-700">
              {savingKey === "App Settings" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save App Settings
            </Button>
          </div>
          <div className="text-xs bg-slate-50 p-3 rounded border space-y-2">
            <p className="font-semibold flex items-center gap-1"><ExternalLink className="h-3 w-3" /> Webhook Callback URL</p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-white px-2 py-1 border rounded flex-1 overflow-x-auto">
                {(appSettings.app_url || (typeof window !== "undefined" ? window.location.origin : ""))}/api/payments/callback
              </code>
              <Button size="sm" variant="outline" onClick={copyWebhookUrl}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
            </div>
            <p className="text-slate-500">Configure this URL in each gateway dashboard so payment events are delivered to your CRM.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function GatewayCard(props: {
  title: string
  description: string
  gateway: GatewayName
  view: GatewayView
  modes: { value: string; label: string }[]
  fields: { key: string; label: string; placeholder: string; type?: string }[]
  savingKey: string | null
  testingKey: string | null
  onChange: (patch: Partial<GatewayView>) => void
  onSave: () => void
  onTest: () => void
}) {
  const { title, description, gateway, view, modes, fields, savingKey, testingKey, onChange, onSave, onTest } = props
  const isSaving = savingKey === title
  const isTesting = testingKey === gateway

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {title}
              {view.is_active ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-slate-300" />
              )}
              {view.last_status === "ok" && <span className="text-xs font-normal text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded">Verified</span>}
              {view.last_status === "error" && <span className="text-xs font-normal text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">Error</span>}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={view.is_active}
            onChange={(e) => onChange({ is_active: e.target.checked })}
          />
          <span className="text-sm font-medium">Enabled</span>
          <span className="text-xs text-slate-500">Show this gateway to customers during checkout</span>
        </label>

        <div>
          <Label>Environment</Label>
          <div className="flex gap-2 mt-1">
            {modes.map(m => (
              <button
                key={m.value}
                type="button"
                onClick={() => onChange({ mode: m.value })}
                className={"px-3 py-1.5 text-sm rounded-md border " + (view.mode === m.value ? "bg-blue-50 border-blue-300 text-blue-700 font-medium" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {fields.map(f => (
          <div key={f.key}>
            <Label>{f.label}</Label>
            <Input
              type={f.type || "text"}
              value={(view as any)[f.key] || ""}
              onChange={(e) => onChange({ [f.key]: e.target.value } as any)}
              placeholder={f.placeholder}
            />
          </div>
        ))}

        {view.last_verified_at && (
          <p className="text-xs text-slate-500">
            Last verified: {new Date(view.last_verified_at).toLocaleString()}
            {view.last_message && <span className="block text-slate-400 mt-0.5">{view.last_message}</span>}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onTest} disabled={isTesting} variant="outline">
            {isTesting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
            Test Connection
          </Button>
          <Button onClick={onSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function PaymentsSettingsPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>}>
      <PaymentsSettingsContent />
    </Suspense>
  )
}
