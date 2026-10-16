import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { formatPrice } from '../lib/format'
import { adminApi, type Area } from './adminApi'
import { useAdminMutation } from './hooks'
import { AdminDialog, Badge, Field, IconButton, inputClass, MoneyInput, PageHeader, Switch } from './ui'

const invalidate = [['admin', 'areas'], ['store']]

export function AreasPage() {
  const { data: areas, isPending } = useQuery({ queryKey: ['admin', 'areas'], queryFn: adminApi.areas })
  const [editing, setEditing] = useState<Area | 'new' | null>(null)
  const toggle = useAdminMutation((a: Area) => adminApi.updateArea(a.id, { ...a, isActive: !a.isActive }), { invalidate })
  const remove = useAdminMutation((id: number) => adminApi.deleteArea(id), { invalidate, success: 'Area deleted' })

  return (
    <div>
      <PageHeader
        title="Delivery areas"
        description="Customers pick one of these at checkout. Each area has its own delivery fee and minimum order."
        actions={
          <button type="button" className="btn-primary px-4 py-2" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Add area
          </button>
        }
      />
      {isPending ? (
        <div className="h-60 animate-pulse rounded-2xl bg-coal" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-charcoal text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">Delivery fee</th>
                <th className="px-4 py-3">Minimum order</th>
                <th className="px-4 py-3">Delivering</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {areas?.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-semibold">{a.name}</td>
                  <td className="px-4 py-3">{a.fee === 0 ? <Badge tone="success">Free</Badge> : formatPrice(a.fee)}</td>
                  <td className="px-4 py-3">{a.minOrder === 0 ? '—' : formatPrice(a.minOrder)}</td>
                  <td className="px-4 py-3">
                    <Switch checked={a.isActive} tone="success" label={`Deliver to ${a.name}`} onChange={() => toggle.mutate(a)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <IconButton label={`Edit ${a.name}`} onClick={() => setEditing(a)}>
                        <Pencil className="size-4" />
                      </IconButton>
                      <IconButton label={`Delete ${a.name}`} onClick={() => confirm(`Delete ${a.name}?`) && remove.mutate(a.id)}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
              {areas?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">
                    No delivery areas yet — customers can only choose pick-up.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {editing && <AreaEditor area={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function AreaEditor({ area, onClose }: { area: Area | null; onClose: () => void }) {
  const [name, setName] = useState(area?.name ?? '')
  const [fee, setFee] = useState<number | null>(area?.fee ?? 100)
  const [minOrder, setMinOrder] = useState<number | null>(area?.minOrder ?? 0)
  const [isActive, setIsActive] = useState(area?.isActive ?? true)

  const save = useAdminMutation(
    () => {
      const body = { name, fee: fee ?? 0, minOrder: minOrder ?? 0, isActive }
      return area ? adminApi.updateArea(area.id, body) : adminApi.createArea(body).then(() => undefined)
    },
    { invalidate, success: 'Area saved', onSuccess: onClose },
  )

  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={area ? `Edit ${area.name}` : 'New delivery area'}
      footer={
        <button type="button" className="btn-primary" disabled={!name.trim() || save.isPending} onClick={() => save.mutate(undefined)}>
          Save
        </button>
      }
    >
      <Field label="Area name" htmlFor="area-name">
        <input id="area-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputClass} placeholder="e.g. DHA Phase 6" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Delivery fee" htmlFor="area-fee">
          <MoneyInput id="area-fee" value={fee} onChange={setFee} />
        </Field>
        <Field label="Minimum order" htmlFor="area-min">
          <MoneyInput id="area-min" value={minOrder} onChange={setMinOrder} />
        </Field>
      </div>
      <label className="flex items-center justify-between gap-3 text-sm font-semibold">
        Delivering to this area
        <Switch checked={isActive} onChange={setIsActive} label="Delivering to this area" />
      </label>
    </AdminDialog>
  )
}
