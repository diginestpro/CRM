export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="h-8 w-40 skeleton mb-2" />
          <div className="h-4 w-72 skeleton" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-36 skeleton rounded-xl" />
          <div className="h-10 w-32 skeleton rounded-xl" />
        </div>
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="h-3 w-24 skeleton mb-3" />
                <div className="h-7 w-32 skeleton mb-2" />
                <div className="h-3 w-20 skeleton" />
              </div>
              <div className="h-11 w-11 skeleton rounded-xl" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between">
            <div><div className="h-4 w-32 skeleton mb-1" /><div className="h-3 w-20 skeleton" /></div>
            <div className="h-3 w-16 skeleton" />
          </div>
          <div className="divide-y divide-slate-100">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-5 py-4 flex justify-between items-center">
                <div className="flex-1"><div className="h-4 w-32 skeleton mb-2" /><div className="h-3 w-24 skeleton" /></div>
                <div className="h-6 w-20 skeleton rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100"><div className="h-4 w-32 skeleton mb-1" /><div className="h-3 w-20 skeleton" /></div>
          <div className="divide-y divide-slate-100">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="px-5 py-4"><div className="h-4 w-28 skeleton mb-2" /><div className="h-3 w-20 skeleton" /></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}