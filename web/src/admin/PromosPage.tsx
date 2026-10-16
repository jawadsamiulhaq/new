import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { formatPrice } from '../lib/format'
import { adminApi, type DiscountType, type Promo, type PromoInput } from './adminApi'
import { useAdminMutation } from './hooks'
import { AdminDialog, Badge, Field, IconButton, inputClass, MoneyInput, PageHeader, Switch } from './ui'

const invalidate = [['admin', 'promos']]
const dateFmt = new Intl.DateTimeFormat('en-PK', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' })

function describe(p: Promo) {
  const value = p.discountType === 'Percent' ? `${p.value}% off${p.maxDiscount ? ` (max ${formatPrice(p.maxDiscount)})` : ''}` : `${formatPrice(p.value)} off`
  const rules = [
    p.minOrder > 0 && `min ${formatPrice(p.minOrder)}`,
    p.firstOrderOnly && 'first order only',
    p.maxUsesPerCustomer && `${p.maxUsesPerCustomer}× per customer`,
    p.expiresAt && `until ${dateFmt.format(new Date(p.expiresAt))}`,
  ].filter(Boolean)
  return [value, ...rules].join(' · ')
}

export function PromosPage() {
  const { data: promos, isPending } = useQuery({ queryKey: ['admin', 'promos'], queryFn: adminApi.promos })
  const [editing, setEditing] = useState<Promo | 'new' | null>(null)
  const toggle = useAdminMutation((p: Promo) => adminApi.updatePromo(p.id, { ...p, isActive: !p.isActive }), { invalidate })

  return (
    <div>
      <PageHeader
        title="Promo codes"
        description="Discounts customers enter at checkout — great for pulling orders away from delivery apps."
        actions={
          <button type="button" className="btn-primary px-4 py-2" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> New code
          </button>
        }
      />
      {isPending ? (
        <div className="h-60 animate-pulse rounded-2xl bg-coal" />
      ) : (
        <ul className="space-y-3">
          {promos?.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-charcoal p-4">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-mono text-lg font-bold">
                  {p.code}
                  {!p.isActive && <Badge tone="danger">Off</Badge>}
                  {p.maxUses !== null && p.usedCount >= p.maxUses && <Badge tone="danger">Used up</Badge>}
                </p>
                <p className="text-sm text-muted">{describe(p)}</p>
                {p.description && <p className="text-sm text-muted italic">{p.description}</p>}
              </div>
              <span className="text-sm text-muted">
                Used {p.usedCount}
                {p.maxUses !== null && ` / ${p.maxUses}`}
              </span>
              <Switch checked={p.isActive} tone="success" label={`${p.code} active`} onChange={() => toggle.mutate(p)} />
              <IconButton label={`Edit ${p.code}`} onClick={() => setEditing(p)}>
                <Pencil className="size-4" />
              </IconButton>
            </li>
          ))}
          {promos?.length === 0 && <p className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">No promo codes yet. Try “FIRST10” — 10% off a customer’s first online order.</p>}
        </ul>
      )}
      {editing && <PromoEditor promo={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** "2026-10-15" (local date input) ↔ ISO instant at the start/end of that day in Lahore (UTC+5). */
const toDateInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 5 * 3600_000).toISOString().slice(0, 10) : '')
const fromDateInput = (date: string, endOfDay: boolean) => (date ? `${date}T${endOfDay ? '23:59:59' : '00:00:00'}+05:00` : null)

function PromoEditor({ promo, onClose }: { promo: Promo | null; onClose: () => void }) {
  const [form, setForm] = useState<PromoInput>(() => ({
    code: promo?.code ?? '',
    description: promo?.description ?? '',
    discountType: promo?.discountType ?? 'Percent',
    value: promo?.value ?? 10,
    maxDiscount: promo?.maxDiscount ?? null,
    minOrder: promo?.minOrder ?? 0,
    startsAt: promo?.startsAt ?? null,
    expiresAt: promo?.expiresAt ?? null,
    maxUses: promo?.maxUses ?? null,
    maxUsesPerCustomer: promo?.maxUsesPerCustomer ?? 1,
    firstOrderOnly: promo?.firstOrderOnly ?? false,
    isActive: promo?.isActive ?? true,
  }))
  const set = <K extends keyof PromoInput>(key: K, value: PromoInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  const save = useAdminMutation(
    () => {
      const body = { ...form, description: form.description || null }
      return promo ? adminApi.updatePromo(promo.id, body) : adminApi.createPromo(body).then(() => undefined)
    },
    { invalidate, success: 'Promo code saved', onSuccess: onClose },
  )

  const optionalNumber = (v: string) => (v === '' ? null : Math.max(1, Math.round(Number(v))))

  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={promo ? `Edit ${promo.code}` : 'New promo code'}
      footer={
        <button type="button" className="btn-primary" disabled={form.code.trim().length < 3 || save.isPending} onClick={() => save.mutate(undefined)}>
          Save
        </button>
      }
    >
      <Field label="Code" htmlFor="promo-code" hint={promo && promo.usedCount > 0 ? 'Already used, so the code itself can’t change.' : 'Letters and numbers only, e.g. FIRST10.'}>
        <input
          id="promo-code"
          value={form.code}
          disabled={!!promo && promo.usedCount > 0}
          onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          maxLength={40}
          className={`${inputClass} font-mono uppercase`}
        />
      </Field>
      <Field label="Note (optional, staff only)" htmlFor="promo-desc">
        <input id="promo-desc" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} maxLength={200} className={inputClass} placeholder="e.g. Instagram campaign" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Discount type" htmlFor="promo-type">
          <select id="promo-type" value={form.discountType} onChange={(e) => set('discountType', e.target.value as DiscountType)} className={inputClass}>
            <option value="Percent">Percent (%)</option>
            <option value="Flat">Fixed amount (Rs)</option>
          </select>
        </Field>
        <Field label={form.discountType === 'Percent' ? 'Percent off' : 'Amount off'} htmlFor="promo-value">
          {form.discountType === 'Percent' ? (
            <input id="promo-value" type="number" min={1} max={100} value={form.value} onChange={(e) => set('value', Math.round(Number(e.target.value)))} className={inputClass} />
          ) : (
            <MoneyInput id="promo-value" value={form.value} onChange={(v) => set('value', v ?? 0)} />
          )}
        </Field>
        {form.discountType === 'Percent' && (
          <Field label="Maximum discount (optional)" htmlFor="promo-cap">
            <MoneyInput id="promo-cap" value={form.maxDiscount} onChange={(v) => set('maxDiscount', v)} placeholder="No cap" />
          </Field>
        )}
        <Field label="Minimum order" htmlFor="promo-min">
          <MoneyInput id="promo-min" value={form.minOrder} onChange={(v) => set('minOrder', v ?? 0)} />
        </Field>
        <Field label="Starts (optional)" htmlFor="promo-start">
          <input id="promo-start" type="date" value={toDateInput(form.startsAt)} onChange={(e) => set('startsAt', fromDateInput(e.target.value, false))} className={inputClass} />
        </Field>
        <Field label="Ends (optional)" htmlFor="promo-end">
          <input id="promo-end" type="date" value={toDateInput(form.expiresAt)} onChange={(e) => set('expiresAt', fromDateInput(e.target.value, true))} className={inputClass} />
        </Field>
        <Field label="Total uses (optional)" htmlFor="promo-uses">
          <input id="promo-uses" type="number" min={1} value={form.maxUses ?? ''} placeholder="Unlimited" onChange={(e) => set('maxUses', optionalNumber(e.target.value))} className={inputClass} />
        </Field>
        <Field label="Uses per customer" htmlFor="promo-per">
          <input id="promo-per" type="number" min={1} value={form.maxUsesPerCustomer ?? ''} placeholder="Unlimited" onChange={(e) => set('maxUsesPerCustomer', optionalNumber(e.target.value))} className={inputClass} />
        </Field>
      </div>
      <label className="flex items-center justify-between gap-3 text-sm font-semibold">
        First order only
        <Switch checked={form.firstOrderOnly} onChange={(v) => set('firstOrderOnly', v)} label="First order only" />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm font-semibold">
        Active
        <Switch checked={form.isActive} onChange={(v) => set('isActive', v)} label="Promo active" tone="success" />
      </label>
    </AdminDialog>
  )
}
