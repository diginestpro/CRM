CONTENT_PART2 = r'''  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 rounded-xl border bg-white p-6 shadow-sm">
        <div className="space-y-2">
          <Label>Client *</Label>
          <select {...register("client_id")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">Select Client</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
          {errors.client_id && <p className="text-xs text-red-500">{errors.client_id.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Quote Number *</Label>
          <Input {...register("quotation_number")} placeholder="QT-2024-001" />
          {errors.quotation_number && <p className="text-xs text-red-500">{errors.quotation_number.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <select {...register("status")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="Draft">Draft</option><option value="Sent">Sent</option><option value="Accepted">Accepted</option><option value="Rejected">Rejected</option>
          </select>
        </div>
        <div className="space-y-2 md:col-span-3">
          <Label>From Office</Label>
          {companyOffices.length === 0 ? (
            <p className="text-xs text-slate-500">No offices saved.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {companyOffices.map((o: any) => {
                const line1 = [o.street, o.city, o.state, o.postal_code, o.country].filter(Boolean).join(", ")
                const checked = (selectedCompanyAddressId || "") === o.id
                return (
                  <label
                    key={o.id}
                    className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer transition ${checked ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}
                  >
                    <input
                      type="radio"
                      name="selected_company_address"
                      className="mt-1"
                      checked={checked}
                      onChange={() => setSelectedCompanyAddressId(o.id)}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{o.address_name || "Office"}</span>
                        {o.is_default && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">Default</span>}
                      </div>
                      <div className="text-xs text-slate-500">{line1 || "-"}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      </div>
      <BillingItems control={control as any} setValue={setValue as any} watch={watch as any} services={services} />
      <div className="flex justify-end gap-3">
        <Button variant="outline" type="button" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">{isLoading ? "Saving..." : "Save Quotation"}</Button>
      </div>
    </form>
  )
}
'''

import os
from write_quotation_form_1 import CONTENT_PART1
write_file = lambda path, content: open(path, "w", encoding="utf-8").write(content)
write_file(r"C:\Users\LENOVO\Desktop\CRM\app\(authed)\quotations\_components\QuotationForm.tsx", CONTENT_PART1 + CONTENT_PART2)
