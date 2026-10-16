import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { adminApi, type Settings } from './adminApi'
import { useAdminMutation } from './hooks'
import { Field, inputBase, inputClass, MoneyInput, PageHeader, Switch } from './ui'

export function SettingsPage() {
  const { data, isPending } = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminApi.settings })
  if (isPending || !data) return <div className="h-96 animate-pulse rounded-3xl bg-coal" />
  return <SettingsForm initial={data} />
}

function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial)
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setS((prev) => ({ ...prev, [key]: value }))
  const setDay = (i: number, patch: Partial<Settings['hours'][number]>) => set('hours', s.hours.map((h, j) => (j === i ? { ...h, ...patch } : h)))

  const save = useAdminMutation(() => adminApi.saveSettings(s), { invalidate: [['admin', 'settings'], ['store']], success: 'Settings saved' })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(undefined)
      }}
      className="max-w-3xl space-y-6"
    >
      <PageHeader title="Settings & hours" description="Changes apply to the website immediately." />

      <Card title="Opening hours" description="When the shop closes after midnight (e.g. 2:00 AM), set the closing time earlier than the opening time — it counts as the next morning.">
        <div className="divide-y divide-line">
          {s.hours.map((h, i) => (
            <div key={h.day} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="w-28 font-semibold">{h.day}</span>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={!h.isClosed} onChange={(open) => setDay(i, { isClosed: !open })} label={`Open on ${h.day}`} tone="success" />
                {h.isClosed ? 'Closed' : 'Open'}
              </label>
              {!h.isClosed && (
                <div className="flex items-center gap-2">
                  <input type="time" aria-label={`${h.day} opens`} value={h.opensAt} onChange={(e) => setDay(i, { opensAt: e.target.value })} className={`${inputBase} w-32`} />
                  <span className="text-muted">to</span>
                  <input type="time" aria-label={`${h.day} closes`} value={h.closesAt} onChange={(e) => setDay(i, { closesAt: e.target.value })} className={`${inputBase} w-32`} />
                  {h.closesAt <= h.opensAt && <span className="text-xs text-muted">(next day)</span>}
                </div>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="mt-3 text-sm text-mustard hover:underline" onClick={() => set('hours', s.hours.map((h) => ({ ...h, opensAt: s.hours[0].opensAt, closesAt: s.hours[0].closesAt, isClosed: s.hours[0].isClosed })))}>
          Copy {s.hours[0]?.day}’s hours to every day
        </button>
      </Card>

      <Card title="Ordering">
        <ToggleRow label="Delivery" checked={s.deliveryEnabled} onChange={(v) => set('deliveryEnabled', v)} />
        <ToggleRow label="Pick-up" checked={s.pickupEnabled} onChange={(v) => set('pickupEnabled', v)} />
        <ToggleRow label="Cash on delivery / at pick-up" checked={s.codEnabled} onChange={(v) => set('codEnabled', v)} />
        <ToggleRow label="Online payment (PayFast)" checked={s.payFastEnabled} onChange={() => undefined} disabled hint="Switched on once PayFast is approved (Phase 4)." />
        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          <Field label="Delivery time estimate (minutes)" htmlFor="eta-delivery">
            <input id="eta-delivery" type="number" min={5} max={240} value={s.estimatedDeliveryMinutes} onChange={(e) => set('estimatedDeliveryMinutes', Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Pick-up time estimate (minutes)" htmlFor="eta-pickup">
            <input id="eta-pickup" type="number" min={5} max={240} value={s.estimatedPickupMinutes} onChange={(e) => set('estimatedPickupMinutes', Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Free delivery on orders over (optional)" htmlFor="free-delivery" hint="Leave empty to always charge the area fee.">
            <MoneyInput id="free-delivery" value={s.freeDeliveryThreshold} onChange={(v) => set('freeDeliveryThreshold', v)} placeholder="Never free" />
          </Field>
        </div>
      </Card>

      <Card title="Tax">
        <ToggleRow label="Menu prices already include tax" checked={s.pricesIncludeTax} onChange={(v) => set('pricesIncludeTax', v)} />
        {!s.pricesIncludeTax && (
          <Field label="Tax added at checkout (%)" htmlFor="tax">
            <input id="tax" type="number" min={0} max={50} step={0.5} value={s.taxPercent} onChange={(e) => set('taxPercent', Number(e.target.value))} className={`${inputBase} w-32`} />
          </Field>
        )}
      </Card>

      <Card title="Shop details">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Shop name" htmlFor="store-name">
            <input id="store-name" value={s.storeName} onChange={(e) => set('storeName', e.target.value)} maxLength={80} className={inputClass} />
          </Field>
          <Field label="Phone shown to customers" htmlFor="store-phone">
            <input id="store-phone" value={s.phone} onChange={(e) => set('phone', e.target.value)} maxLength={20} className={inputClass} />
          </Field>
          <Field label="WhatsApp number" htmlFor="store-wa" hint="International format, e.g. +923441858989. Also gets the SMS backup alert.">
            <input id="store-wa" value={s.whatsAppNumber ?? ''} onChange={(e) => set('whatsAppNumber', e.target.value || null)} maxLength={20} className={inputClass} />
          </Field>
        </div>
        <Field label="Address" htmlFor="store-address">
          <textarea id="store-address" rows={2} value={s.address} onChange={(e) => set('address', e.target.value)} maxLength={500} className={`${inputClass} resize-none`} />
        </Field>
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <button type="submit" className="btn-primary shadow-2xl shadow-black/50" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </form>
  )
}

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-charcoal p-5">
      <div>
        <h2 className="font-display text-lg font-bold">{title}</h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function ToggleRow({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} tone="success" />
    </div>
  )
}
