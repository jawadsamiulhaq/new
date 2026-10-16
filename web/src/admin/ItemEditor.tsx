import { ArrowDown, ArrowUp, ImagePlus, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { ItemImage } from '../features/menu/ItemImage'
import { adminApi, type AdminItem, type AdminMenu, type ItemGroupLink, type ItemInput } from './adminApi'
import { resizeImage } from './resizeImage'
import { useAdminMutation } from './hooks'
import { AdminDialog, Field, IconButton, inputBase, inputClass, MoneyInput, Switch } from './ui'

const invalidate = [['admin', 'menu'], ['menu']]

/** Owner's editor for one menu item: details, photo and option rules. */
export function ItemEditor({ menu, item, categoryId, onClose }: { menu: AdminMenu; item: AdminItem | null; categoryId: number; onClose: () => void }) {
  const [itemId, setItemId] = useState<number | null>(item?.id ?? null)
  const [form, setForm] = useState<ItemInput>(() => ({
    categoryId: item?.categoryId ?? categoryId,
    name: item?.name ?? '',
    description: item?.description ?? '',
    price: item?.price ?? 0,
    isAvailable: item?.isAvailable ?? true,
    isActive: item?.isActive ?? true,
    isFeatured: item?.isFeatured ?? false,
    leadTimeHours: item?.leadTimeHours ?? 0,
    optionGroups: item?.optionGroups ?? [],
  }))
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? null)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof ItemInput>(key: K, value: ItemInput[K]) => setForm((f) => ({ ...f, [key]: value }))
  const setLink = (index: number, patch: Partial<ItemGroupLink>) =>
    setForm((f) => ({ ...f, optionGroups: f.optionGroups.map((l, i) => (i === index ? { ...l, ...patch } : l)) }))

  const save = useAdminMutation(
    async () => {
      const body = { ...form, description: form.description || null }
      if (itemId) {
        await adminApi.updateItem(itemId, body)
        return itemId
      }
      return (await adminApi.createItem(body)).id
    },
    {
      invalidate,
      success: itemId ? 'Item saved' : 'Item added — you can add a photo now',
      onSuccess: (id) => (itemId ? onClose() : setItemId(id)),
    },
  )

  const upload = useAdminMutation(async (file: File) => (await adminApi.uploadImage(itemId!, await resizeImage(file))).imageUrl, {
    invalidate,
    success: 'Photo updated',
    onSuccess: (url) => setImageUrl(url),
  })
  const removeImage = useAdminMutation(() => adminApi.deleteImage(itemId!), { invalidate, success: 'Photo removed', onSuccess: () => setImageUrl(null) })
  const remove = useAdminMutation(() => adminApi.deleteItem(itemId!), { invalidate, success: 'Item deleted', onSuccess: onClose })

  const category = menu.categories.find((c) => c.id === form.categoryId)
  const groupsById = new Map(menu.optionGroups.map((g) => [g.id, g]))
  const unusedGroups = menu.optionGroups.filter((g) => !form.optionGroups.some((l) => l.optionGroupId === g.id))

  return (
    <AdminDialog
      open
      wide
      onOpenChange={(open) => !open && onClose()}
      title={itemId ? `Edit ${form.name || 'item'}` : 'New menu item'}
      footer={
        <>
          {itemId && (
            <button type="button" className="btn-ghost mr-auto text-danger hover:border-danger hover:text-danger" onClick={() => confirm(`Delete "${form.name}" from the menu? Past orders are not affected. To hide it temporarily, switch off "Show on the website" instead.`) && remove.mutate(undefined)}>
              <Trash2 className="size-4" /> Delete
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>
            {itemId && !item ? 'Done' : 'Cancel'}
          </button>
          <button type="button" className="btn-primary" disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate(undefined)}>
            {itemId ? 'Save changes' : 'Add item'}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <div className="space-y-4">
          <Field label="Name" htmlFor="item-name">
            <input id="item-name" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={80} className={inputClass} />
          </Field>
          <Field label="Description (optional)" htmlFor="item-desc">
            <textarea id="item-desc" rows={2} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} maxLength={500} className={`${inputClass} resize-none`} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price" htmlFor="item-price">
              <MoneyInput id="item-price" value={form.price} onChange={(v) => set('price', v ?? 0)} />
            </Field>
            <Field label="Category" htmlFor="item-cat">
              <select id="item-cat" value={form.categoryId} onChange={(e) => set('categoryId', Number(e.target.value))} className={inputClass}>
                {menu.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Advance notice (hours)" htmlFor="item-lead" hint="For cakes and other made-to-order items. 0 = ready now.">
            <input id="item-lead" type="number" min={0} max={336} value={form.leadTimeHours} onChange={(e) => set('leadTimeHours', Math.max(0, Number(e.target.value)))} className={inputClass} />
          </Field>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">Photo</p>
          <ItemImage name={form.name || 'Item'} categoryName={category?.name ?? ''} imageUrl={imageUrl} brand={category?.brand ?? 'BurChips'} className="aspect-square w-full rounded-2xl" />
          {itemId ? (
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) upload.mutate(file)
                  e.target.value = ''
                }}
              />
              <button type="button" className="btn-ghost flex-1 px-3 py-2 text-sm" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
                <ImagePlus className="size-4" /> {upload.isPending ? 'Uploading…' : imageUrl ? 'Replace' : 'Upload'}
              </button>
              {imageUrl && (
                <IconButton label="Remove photo" onClick={() => removeImage.mutate(undefined)}>
                  <X className="size-4" />
                </IconButton>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted">Add the item first, then upload a photo.</p>
          )}
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-line p-4 sm:grid-cols-3">
        <Toggle label="Available now" checked={form.isAvailable} onChange={(v) => set('isAvailable', v)} />
        <Toggle label="Show on website" checked={form.isActive} onChange={(v) => set('isActive', v)} />
        <Toggle label="Popular pick" checked={form.isFeatured} onChange={(v) => set('isFeatured', v)} />
      </div>

      <section aria-labelledby="links-title" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 id="links-title" className="font-display text-lg font-bold">
            Customer choices
          </h3>
          <select
            aria-label="Add an option group"
            value=""
            onChange={(e) => {
              const group = groupsById.get(Number(e.target.value))
              if (group)
                set('optionGroups', [...form.optionGroups, { optionGroupId: group.id, title: group.name, minSelect: 0, maxSelect: 1, freeSelections: 0, dependsOnOptionId: null }])
            }}
            className={`${inputBase} w-auto py-2 text-sm`}
            disabled={unusedGroups.length === 0}
          >
            <option value="">+ Add option group…</option>
            {unusedGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.options.length})
              </option>
            ))}
          </select>
        </div>
        {form.optionGroups.length === 0 && <p className="text-sm text-muted">No choices — customers add this item as it is.</p>}

        {form.optionGroups.map((link, index) => {
          const group = groupsById.get(link.optionGroupId)
          const parentChoices = form.optionGroups
            .filter((l) => l.optionGroupId !== link.optionGroupId)
            .flatMap((l) => (groupsById.get(l.optionGroupId)?.options ?? []).map((o) => ({ id: o.id, label: `${groupsById.get(l.optionGroupId)?.name}: ${o.name}` })))
          return (
            <div key={link.optionGroupId} className="space-y-3 rounded-2xl border border-line bg-charcoal p-4">
              <div className="flex items-center gap-2">
                <p className="flex-1 text-sm text-muted">
                  Group: <span className="font-semibold text-cream">{group?.name}</span> · {group?.options.map((o) => o.name).join(', ')}
                </p>
                <IconButton label="Move up" disabled={index === 0} onClick={() => set('optionGroups', moveItem(form.optionGroups, index, -1))}>
                  <ArrowUp className="size-4" />
                </IconButton>
                <IconButton label="Move down" disabled={index === form.optionGroups.length - 1} onClick={() => set('optionGroups', moveItem(form.optionGroups, index, 1))}>
                  <ArrowDown className="size-4" />
                </IconButton>
                <IconButton label={`Remove ${group?.name}`} onClick={() => set('optionGroups', form.optionGroups.filter((_, i) => i !== index))}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
              <Field label="Title customers see" htmlFor={`link-title-${index}`}>
                <input id={`link-title-${index}`} value={link.title} onChange={(e) => setLink(index, { title: e.target.value })} maxLength={80} className={inputClass} />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <NumberField id={`link-min-${index}`} label="Must pick at least" value={link.minSelect} onChange={(v) => setLink(index, { minSelect: v })} />
                <NumberField id={`link-max-${index}`} label="Can pick up to" value={link.maxSelect} onChange={(v) => setLink(index, { maxSelect: Math.max(1, v) })} />
                <NumberField id={`link-free-${index}`} label="Free picks" value={link.freeSelections} onChange={(v) => setLink(index, { freeSelections: v })} />
              </div>
              {parentChoices.length > 0 && (
                <Field label="Only show when this is picked (optional)" htmlFor={`link-dep-${index}`} hint="e.g. show “Meal drink” only after “Make it a meal”.">
                  <select
                    id={`link-dep-${index}`}
                    value={link.dependsOnOptionId ?? ''}
                    onChange={(e) => setLink(index, { dependsOnOptionId: e.target.value ? Number(e.target.value) : null })}
                    className={inputClass}
                  >
                    <option value="">Always show</option>
                    {parentChoices.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          )
        })}
      </section>
    </AdminDialog>
  )
}

function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const next = [...list]
  const [x] = next.splice(index, 1)
  next.splice(index + delta, 0, x)
  return next
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm font-semibold">
      {label}
      <Switch checked={checked} onChange={onChange} label={label} />
    </label>
  )
}

function NumberField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label} htmlFor={id}>
      <input id={id} type="number" min={0} max={40} value={value} onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value))))} className={inputClass} />
    </Field>
  )
}
