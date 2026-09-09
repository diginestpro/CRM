"use client"

import { useEffect, useState } from "react"
import { createClientBrowser } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Loader2, Save, Building2, Mail, Phone, Globe, Hash, MapPin, Plus, Trash2, Star } from "lucide-react"

interface Company {
  id: string
  name: string
  email: string
  phone: string
  website: string
  tax_number: string
  logo_url: string
}

interface CompanyAddress {
  id: string
  address_name: string | null
  street: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  is_default: boolean
}

export default function CompanySettingsPage() {
  const [company, setCompany] = useState<Company>({ id: "", name: "", email: "", phone: "", website: "", tax_number: "", logo_url: "" })
  const [addresses, setAddresses] = useState<CompanyAddress[]>([])
  const [newAddr, setNewAddr] = useState({ address_name: "", street: "", city: "", state: "", postal_code: "", country: "" })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isAddingAddr, setIsAddingAddr] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const sb = createClientBrowser()
        const { data: { user } } = await sb.auth.getUser()
        if (!user) return
        const { data: profile } = await sb.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
        if (profile?.company_id) {
          const [{ data }, { data: addrs }] = await Promise.all([
            sb.from("companies").select("*").eq("id", profile.company_id).maybeSingle(),
            sb.from("company_addresses").select("*").eq("company_id", profile.company_id).order("is_default", { ascending: false }).order("created_at"),
          ])
          if (data) {
            setCompany({
              id: data.id,
              name: data.name || "",
              email: data.email || "",
              phone: data.phone || "",
              website: data.website || "",
              tax_number: data.tax_number || "",
              logo_url: data.logo_url || "",
            })
          }
          setAddresses(addrs || [])
        }
      } catch (e) {
        console.error(e)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  async function handleSave() {
    setIsSaving(true)
    try {
      const sb = createClientBrowser()
      const { error } = await sb.from("companies").update({
        name: company.name,
        email: company.email,
        phone: company.phone,
        website: company.website,
        tax_number: company.tax_number,
        logo_url: company.logo_url,
      }).eq("id", company.id)
      if (error) throw error
      toast.success("Company details updated!")
    } catch (e: any) {
      toast.error(e.message || "Failed")
    } finally {
      setIsSaving(false)
    }
  }

  async function refreshAddresses() {
    const sb = createClientBrowser()
    const { data } = await sb.from("company_addresses").select("*").eq("company_id", company.id).order("is_default", { ascending: false }).order("created_at")
    setAddresses(data || [])
  }

  async function handleAddAddress() {
    if (!newAddr.address_name.trim()) {
      toast.error("Please give the address a label")
      return
    }
    setIsAddingAddr(true)
    try {
      const sb = createClientBrowser()
      const isFirst = addresses.length === 0
      const { error } = await sb.from("company_addresses").insert({
        company_id: company.id,
        address_name: newAddr.address_name,
        street: newAddr.street || null,
        city: newAddr.city || null,
        state: newAddr.state || null,
        postal_code: newAddr.postal_code || null,
        country: newAddr.country || null,
        is_default: isFirst,
      })
      if (error) throw error
      toast.success("Address added!")
      setNewAddr({ address_name: "", street: "", city: "", state: "", postal_code: "", country: "" })
      await refreshAddresses()
    } catch (e: any) {
      toast.error(e.message || "Failed")
    } finally {
      setIsAddingAddr(false)
    }
  }

  async function handleDeleteAddress(id: string) {
    const sb = createClientBrowser()
    const { error } = await sb.from("company_addresses").delete().eq("id", id)
    if (error) { toast.error(error.message); return }
    await refreshAddresses()
  }

  async function handleMarkDefault(id: string) {
    const sb = createClientBrowser()
    await sb.from("company_addresses").update({ is_default: false }).eq("company_id", company.id)
    const { error } = await sb.from("company_addresses").update({ is_default: true }).eq("id", id)
    if (error) { toast.error(error.message); return }
    await refreshAddresses()
  }

  if (isLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Company Details</h2>
        <p className="text-slate-500">Business information used on invoices and emails.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Logo</CardTitle>
          <CardDescription>Appears on invoices and email headers.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="h-24 w-24 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold overflow-hidden">
              {company.logo_url ? (
                <img src={company.logo_url} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                company.name?.charAt(0).toUpperCase() || <Building2 className="h-12 w-12" />
              )}
            </div>
            <div className="space-y-2 flex-1">
              <Label htmlFor="logo-url">Logo URL</Label>
              <Input
                id="logo-url"
                value={company.logo_url}
                onChange={(e) => setCompany({ ...company, logo_url: e.target.value })}
                placeholder="https://example.com/logo.png"
              />
              <p className="text-xs text-slate-500">Paste a URL to your logo image.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Business Information</CardTitle>
          <CardDescription>Used on invoices and quotations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Company Name *</Label>
            <Input
              id="name"
              value={company.name}
              onChange={(e) => setCompany({ ...company, name: e.target.value })}
              placeholder="Acme Corporation"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Business Email</Label>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  value={company.email}
                  onChange={(e) => setCompany({ ...company, email: e.target.value })}
                  placeholder="contact@acme.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-400" />
                <Input
                  id="phone"
                  value={company.phone}
                  onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                  placeholder="+1 555 0000"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-slate-400" />
                <Input
                  id="website"
                  value={company.website}
                  onChange={(e) => setCompany({ ...company, website: e.target.value })}
                  placeholder="https://example.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax_number">Tax / VAT Number</Label>
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-slate-400" />
                <Input
                  id="tax_number"
                  value={company.tax_number}
                  onChange={(e) => setCompany({ ...company, tax_number: e.target.value })}
                  placeholder="VAT123456789"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company Addresses</CardTitle>
          <CardDescription>
            Save multiple business addresses. You can pick one for each invoice&apos;s &quot;From&quot; block.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Existing addresses */}
          {addresses.length === 0 ? (
            <p className="text-sm text-slate-500">No addresses saved yet.</p>
          ) : (
            <div className="space-y-2">
              {addresses.map(a => (
                <div key={a.id} className="flex items-start justify-between rounded-md border p-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      <span className="font-medium text-sm">{a.address_name || "Address"}</span>
                      {a.is_default && (
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">Default</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {[a.street, [a.city, a.state, a.postal_code].filter(Boolean).join(", "), a.country]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!a.is_default && (
                      <Button variant="ghost" size="sm" onClick={() => handleMarkDefault(a.id)} title="Set as default">
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteAddress(a.id)} title="Delete">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add new address */}
          <div className="border-t pt-4 space-y-3">
            <h4 className="text-sm font-semibold text-slate-700">Add a new address</h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Label *</Label>
                <Input value={newAddr.address_name} onChange={(e) => setNewAddr({ ...newAddr, address_name: e.target.value })} placeholder="e.g. Head Office" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Street</Label>
                <Input value={newAddr.street} onChange={(e) => setNewAddr({ ...newAddr, street: e.target.value })} placeholder="2211 N First St" />
              </div>
              <div className="space-y-2"><Label>City</Label><Input value={newAddr.city} onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })} placeholder="San Jose" /></div>
              <div className="space-y-2"><Label>State</Label><Input value={newAddr.state} onChange={(e) => setNewAddr({ ...newAddr, state: e.target.value })} placeholder="CA" /></div>
              <div className="space-y-2"><Label>Postal Code</Label><Input value={newAddr.postal_code} onChange={(e) => setNewAddr({ ...newAddr, postal_code: e.target.value })} placeholder="95131" /></div>
              <div className="space-y-2"><Label>Country</Label><Input value={newAddr.country} onChange={(e) => setNewAddr({ ...newAddr, country: e.target.value })} placeholder="United States" /></div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleAddAddress} disabled={isAddingAddr} variant="outline">
                <Plus className="h-4 w-4 mr-2" /> Add address
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Company Details
        </Button>
      </div>
    </div>
  )
}
