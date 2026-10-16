import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useOutletContext } from 'react-router'
import { formatPrice } from '../lib/format'
import { adminApi, type AdminOptionGroup, type StaffMe } from './adminApi'
import { useAdminMenu, useAdminMutation } from './hooks'
import { AdminDialog, Badge, Field, IconButton, inputClass, MoneyInput, PageHeader, Switch } from './ui'

const invalidate = [['admin', 'menu'], ['menu']]

/** Reusable choice lists (sauces, drinks, extras). Staff can mark single options sold out (e.g. Pepsi). */
export function OptionsPage() {
  const me = useOutletContext<StaffMe>()
  const isOwner = me.role === 'Owner'
  const { data: menu, isPending } = useAdminMenu()
  const [editing, setEditing] = useState<AdminOptionGroup | 'new' | null>(null)

  const availability = useAdminMutation((a: { id: number; on: boolean }) => adminApi.setOptionAvailable(a.id, a.on), { invalidate })
  const remove = useAdminMutation((id: number) => adminApi.deleteOptionGroup(id), { invalidate, success: 'Group deleted' })

  if (isPending || !menu) return <div className="h-96 animate-pulse rounded-3xl bg-coal" />

  return (
    <div>
      <PageHeader
        title="Options & sauces"
        description="Choice lists shared by menu items. Switch a single choice off when it runs out."
        actions={
          isOwner && (
            <button type="button" className="btn-primary px-4 py-2" onClick={() => setEditing('new')}>
              <Plus className="size-4" /> New group
            </button>
          )
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {menu.optionGroups.map((group) => (
          <section key={group.id} className="rounded-2xl border border-line bg-charcoal p-4" aria-labelledby={`group-${group.id}`}>
            <div className="mb-2 flex items-center gap-2">
              <h2 id={`group-${group.id}`} className="flex-1 font-display text-lg font-bold">
                {group.name}
              </h2>
              <Badge>Used by {group.usedByItems} item{group.usedByItems === 1 ? '' : 's'}</Badge>
              {isOwner && (
                <>
                  <IconButton label={`Edit ${group.name}`} onClick={() => setEditing(group)}>
                    <Pencil className="size-4" />
                  </IconButton>
                  {group.usedByItems === 0 && (
                    <IconButton label={`Delete ${group.name}`} onClick={() => confirm(`Delete "${group.name}"?`) && remove.mutate(group.id)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  )}
                </>
              )}
            </div>
            <ul className="divide-y divide-line">
              {group.options.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className={o.isAvailable ? '' : 'text-muted line-through'}>
                    {o.name} {o.priceDelta > 0 && <span className="text-muted">+{formatPrice(o.priceDelta)}</span>}
                  </span>
                  <Switch checked={o.isAvailable} tone="success" label={`${o.name} available`} onChange={(on) => availability.mutate({ id: o.id, on })} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {editing && <GroupEditor group={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

interface Row {
  id: number | null
  name: string
  priceDelta: number
  isAvailable: boolean
}

function GroupEditor({ group, onClose }: { group: AdminOptionGroup | null; onClose: () => void }) {
  const [name, setName] = useState(group?.name ?? '')
  const [rows, setRows] = useState<Row[]>(() => group?.options.map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta, isAvailable: o.isAvailable })) ?? [{ id: null, name: '', priceDelta: 0, isAvailable: true }])

  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)))
  const move = (i: number, d: number) =>
    setRows((r) => {
      const next = [...r]
      const [x] = next.splice(i, 1)
      next.splice(i + d, 0, x)
      return next
    })

  const save = useAdminMutation(
    () => {
      const body = { name, options: rows.filter((r) => r.name.trim()) }
      return group ? adminApi.updateOptionGroup(group.id, body) : adminApi.createOptionGroup(body).then(() => undefined)
    },
    { invalidate, success: 'Options saved', onSuccess: onClose },
  )

  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={group ? `Edit ${group.name}` : 'New option group'}
      footer={
        <button type="button" className="btn-primary" disabled={!name.trim() || !rows.some((r) => r.name.trim()) || save.isPending} onClick={() => save.mutate(undefined)}>
          Save
        </button>
      }
    >
      <Field label="Group name" htmlFor="group-name" hint="For your reference, e.g. “Cake sizes”. Each item sets the title customers see.">
        <input id="group-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputClass} />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-semibold">Options</p>
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <input aria-label={`Option ${i + 1} name`} value={row.name} onChange={(e) => update(i, { name: e.target.value })} maxLength={60} className={inputClass} placeholder="Name" />
            <div className="w-32 shrink-0">
              <MoneyInput id={`opt-price-${i}`} value={row.priceDelta} onChange={(v) => update(i, { priceDelta: v ?? 0 })} />
            </div>
            <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp className="size-4" />
            </IconButton>
            <IconButton label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown className="size-4" />
            </IconButton>
            <IconButton label={`Remove option ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        ))}
        <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={() => setRows((r) => [...r, { id: null, name: '', priceDelta: 0, isAvailable: true }])}>
          <Plus className="size-4" /> Add option
        </button>
        <p className="text-xs text-muted">Price is what the option adds to the item (Rs 0 = included).</p>
      </div>
    </AdminDialog>
  )
}
