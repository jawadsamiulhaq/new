import { ArrowDown, ArrowUp, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useOutletContext } from 'react-router'
import { ItemImage } from '../features/menu/ItemImage'
import type { Brand } from '../lib/api'
import { formatPrice } from '../lib/format'
import { adminApi, type AdminCategory, type AdminItem, type StaffMe } from './adminApi'
import { ItemEditor } from './ItemEditor'
import { useAdminMenu, useAdminMutation } from './hooks'
import { AdminDialog, Badge, Field, IconButton, inputClass, PageHeader, Switch } from './ui'

function move<T>(list: T[], index: number, delta: number): T[] {
  const next = [...list]
  const [item] = next.splice(index, 1)
  next.splice(index + delta, 0, item)
  return next
}

export function MenuPage() {
  const me = useOutletContext<StaffMe>()
  const isOwner = me.role === 'Owner'
  const { data: menu, isPending } = useAdminMenu()
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<{ item: AdminItem | null; categoryId: number } | null>(null)
  const [categoryEdit, setCategoryEdit] = useState<AdminCategory | 'new' | null>(null)

  const invalidate = [['admin', 'menu'], ['menu']]
  const availability = useAdminMutation((a: { id: number; on: boolean }) => adminApi.setItemAvailable(a.id, a.on), { invalidate })
  const reorderCategories = useAdminMutation((ids: number[]) => adminApi.reorderCategories(ids), { invalidate })
  const reorderItems = useAdminMutation((a: { categoryId: number; ids: number[] }) => adminApi.reorderItems(a.categoryId, a.ids), { invalidate })
  const deleteCategory = useAdminMutation((id: number) => adminApi.deleteCategory(id), { invalidate, success: 'Category deleted' })

  if (isPending || !menu) return <div className="h-96 animate-pulse rounded-3xl bg-coal" />

  const term = filter.trim().toLowerCase()

  return (
    <div>
      <PageHeader
        title="Menu"
        description={isOwner ? 'Edit items, prices, photos and options. Changes show on the website straight away.' : 'Switch items off when they sell out.'}
        actions={
          isOwner && (
            <button type="button" className="btn-primary px-4 py-2" onClick={() => setCategoryEdit('new')}>
              <Plus className="size-4" /> Add category
            </button>
          )
        }
      />

      <div className="relative mb-6 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input aria-label="Find an item" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find an item…" className={`${inputClass} pl-9`} />
      </div>

      <div className="space-y-8">
        {menu.categories.map((category, ci) => {
          const items = category.items.filter((i) => !term || i.name.toLowerCase().includes(term))
          if (term && items.length === 0) return null
          return (
            <section key={category.id} aria-labelledby={`cat-${category.id}`}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 id={`cat-${category.id}`} className={`section-bar ${category.brand === 'BakeDukan' ? 'text-dukan' : ''}`}>
                  {category.name}
                </h2>
                {!category.isActive && <Badge tone="danger">Hidden</Badge>}
                {isOwner && !term && (
                  <div className="ml-auto flex items-center gap-1">
                    <IconButton label={`Move ${category.name} up`} disabled={ci === 0} onClick={() => reorderCategories.mutate(move(menu.categories, ci, -1).map((c) => c.id))}>
                      <ArrowUp className="size-4" />
                    </IconButton>
                    <IconButton label={`Move ${category.name} down`} disabled={ci === menu.categories.length - 1} onClick={() => reorderCategories.mutate(move(menu.categories, ci, 1).map((c) => c.id))}>
                      <ArrowDown className="size-4" />
                    </IconButton>
                    <IconButton label={`Edit ${category.name}`} onClick={() => setCategoryEdit(category)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    {category.items.length === 0 && (
                      <IconButton label={`Delete ${category.name}`} onClick={() => confirm(`Delete the empty category "${category.name}"?`) && deleteCategory.mutate(category.id)}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    )}
                    <button type="button" className="btn-ghost ml-1 px-3 py-1.5 text-sm" onClick={() => setEditing({ item: null, categoryId: category.id })}>
                      <Plus className="size-4" /> Item
                    </button>
                  </div>
                )}
              </div>

              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-charcoal">
                {items.length === 0 && <li className="p-4 text-sm text-muted">No items yet.</li>}
                {items.map((item, ii) => (
                  <li key={item.id} className={`flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap ${item.isAvailable && item.isActive ? '' : 'opacity-70'}`}>
                    <ItemImage name={item.name} categoryName={category.name} imageUrl={item.imageUrl} brand={category.brand} className="size-14 shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                        {item.name}
                        {item.isFeatured && <Star className="size-3.5 fill-mustard text-mustard" aria-label="Popular pick" />}
                        {!item.isActive && <Badge tone="danger">Hidden</Badge>}
                        {!item.isAvailable && <Badge tone="danger">Sold out</Badge>}
                        {item.leadTimeHours > 0 && <Badge>{item.leadTimeHours}h notice</Badge>}
                      </p>
                      <p className="line-clamp-1 text-sm text-muted">
                        {formatPrice(item.price)}
                        {item.optionGroups.length > 0 && ` · ${item.optionGroups.map((g) => g.title).join(', ')}`}
                      </p>
                    </div>
                    {/* On phones the controls get their own row so the name has room. */}
                    <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
                      <span className="mr-auto text-xs text-muted sm:mr-0">{item.isAvailable ? 'Available' : 'Sold out'}</span>
                      <Switch
                        checked={item.isAvailable}
                        tone="success"
                        label={`${item.name} available`}
                        onChange={(on) => availability.mutate({ id: item.id, on })}
                      />
                      {isOwner && !term && (
                        <span className="hidden sm:contents">
                          <IconButton label={`Move ${item.name} up`} disabled={ii === 0} onClick={() => reorderItems.mutate({ categoryId: category.id, ids: move(category.items, ii, -1).map((i) => i.id) })}>
                            <ArrowUp className="size-4" />
                          </IconButton>
                          <IconButton label={`Move ${item.name} down`} disabled={ii === category.items.length - 1} onClick={() => reorderItems.mutate({ categoryId: category.id, ids: move(category.items, ii, 1).map((i) => i.id) })}>
                            <ArrowDown className="size-4" />
                          </IconButton>
                        </span>
                      )}
                      {isOwner && (
                        <IconButton label={`Edit ${item.name}`} onClick={() => setEditing({ item, categoryId: category.id })}>
                          <Pencil className="size-4" />
                        </IconButton>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      {editing && (
        <ItemEditor key={editing.item?.id ?? `new-${editing.categoryId}`} menu={menu} item={editing.item} categoryId={editing.categoryId} onClose={() => setEditing(null)} />
      )}
      {categoryEdit && <CategoryEditor category={categoryEdit === 'new' ? null : categoryEdit} onClose={() => setCategoryEdit(null)} />}
    </div>
  )
}

function CategoryEditor({ category, onClose }: { category: AdminCategory | null; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [brand, setBrand] = useState<Brand>(category?.brand ?? 'BurChips')
  const [isActive, setIsActive] = useState(category?.isActive ?? true)

  const save = useAdminMutation(
    () => {
      const body = { name, description: description || null, brand, isActive }
      return category ? adminApi.updateCategory(category.id, body) : adminApi.createCategory(body).then(() => undefined)
    },
    { invalidate: [['admin', 'menu'], ['menu']], success: category ? 'Category saved' : 'Category added', onSuccess: onClose },
  )

  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={category ? `Edit ${category.name}` : 'New category'}
      footer={
        <button type="button" className="btn-primary" disabled={!name.trim() || save.isPending} onClick={() => save.mutate(undefined)}>
          Save
        </button>
      }
    >
      <Field label="Name" htmlFor="cat-name">
        <input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputClass} placeholder="e.g. Cakes" />
      </Field>
      <Field label="Short description (optional)" htmlFor="cat-desc">
        <input id="cat-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} className={inputClass} placeholder="e.g. Order one day in advance" />
      </Field>
      <Field label="Brand" htmlFor="cat-brand" hint="Bake Dukan sections use the pink accent.">
        <select id="cat-brand" value={brand} onChange={(e) => setBrand(e.target.value as Brand)} className={inputClass}>
          <option value="BurChips">BurChips</option>
          <option value="BakeDukan">Bake Dukan</option>
        </select>
      </Field>
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">Show on the website</span>
        <Switch checked={isActive} onChange={setIsActive} label="Show category on the website" />
      </label>
    </AdminDialog>
  )
}
