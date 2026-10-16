import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { MenuCategory, MenuItem, MenuOptionGroup } from '../../lib/api'
import { formatPrice } from '../../lib/format'
import {
  chargedOptions,
  chosenOptions,
  groupRule,
  invalidGroups,
  unitPrice,
  visibleGroups,
  type Selections,
} from '../../lib/pricing'
import { useCart } from '../cart/cartStore'
import { QuantityStepper } from '../../components/QuantityStepper'
import { useToast } from '../../components/toastStore'
import { ItemImage } from './ItemImage'

interface ItemDialogProps {
  item: MenuItem
  category: MenuCategory
  onClose: () => void
}

const NOTE_MAX = 140

export function ItemDialog({ item, category, onClose }: ItemDialogProps) {
  const [selections, setSelections] = useState<Selections>({})
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const addToCart = useCart((s) => s.add)
  const toast = useToast((s) => s.show)

  const groups = visibleGroups(item, selections)
  const invalid = useMemo(() => invalidGroups(item, selections), [item, selections])
  const price = unitPrice(item, selections)
  const dukan = category.brand === 'BakeDukan'

  function toggle(group: MenuOptionGroup, optionId: number) {
    setSelections((prev) => {
      const current = prev[group.id] ?? []
      let next: number[]
      if (current.includes(optionId)) {
        next = current.filter((id) => id !== optionId)
      } else if (group.maxSelect === 1) {
        next = [optionId] // radio-style: replace the previous pick
      } else if (current.length >= group.maxSelect) {
        return prev
      } else {
        next = [...current, optionId]
      }
      return { ...prev, [group.id]: next }
    })
  }

  function handleAdd() {
    if (invalid.length > 0) {
      setShowErrors(true)
      document.getElementById(`group-${invalid[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    addToCart(
      {
        menuItemId: item.id,
        name: item.name,
        basePrice: item.price,
        options: chosenOptions(item, selections),
        unitPrice: price,
        note: note.trim() || undefined,
      },
      quantity,
    )
    toast(`Added ${quantity > 1 ? `${quantity} × ` : ''}${item.name} to your cart`)
    onClose()
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm data-[state=open]:animate-[fade-in_150ms]" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl border border-line bg-ink shadow-2xl outline-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[88dvh] sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl data-[state=open]:animate-[sheet-up_200ms_ease-out] sm:data-[state=open]:animate-[fade-in_150ms]"
          aria-describedby={undefined}
        >
          <div className="overflow-y-auto overscroll-contain">
            <div className="relative">
              <ItemImage
                name={item.name}
                categoryName={category.name}
                imageUrl={item.imageUrl}
                brand={category.brand}
                className="aspect-[16/9] w-full"
              />
              <Dialog.Close
                className="absolute top-3 right-3 grid size-10 place-items-center rounded-full bg-black/60 text-cream backdrop-blur hover:bg-black/80"
                aria-label="Close"
              >
                <X className="size-5" />
              </Dialog.Close>
            </div>

            <div className="space-y-6 p-5">
              <div>
                <Dialog.Title className="font-display text-2xl font-extrabold">{item.name}</Dialog.Title>
                {item.description && <p className="mt-1 text-muted">{item.description}</p>}
                <p className={`mt-2 font-display text-xl font-extrabold ${dukan ? 'text-dukan' : 'text-mustard'}`}>
                  {formatPrice(item.price)}
                </p>
                {item.leadTimeHours > 0 && (
                  <p className="mt-2 text-sm text-muted">Needs {item.leadTimeHours} hours’ notice.</p>
                )}
              </div>

              {groups.map((group) => (
                <OptionGroupField
                  key={group.id}
                  group={group}
                  selected={selections[group.id] ?? []}
                  onToggle={(id) => toggle(group, id)}
                  hasError={showErrors && invalid.some((g) => g.id === group.id)}
                  dukan={dukan}
                />
              ))}

              <div>
                <label htmlFor="item-note" className="text-sm font-semibold">
                  Special instructions <span className="font-normal text-muted">(optional)</span>
                </label>
                <textarea
                  id="item-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                  rows={2}
                  placeholder="e.g. no jalapeño, extra crispy"
                  className="mt-2 w-full resize-none rounded-xl border border-line bg-coal px-3 py-2 text-cream placeholder:text-muted/70 focus:border-mustard focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-line bg-charcoal p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <QuantityStepper value={quantity} onChange={setQuantity} />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!item.isAvailable}
              className={`btn-primary flex-1 ${dukan ? 'bg-dukan hover:bg-dukan-dark' : ''}`}
            >
              {item.isAvailable ? `Add · ${formatPrice(price * quantity)}` : 'Sold out'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface OptionGroupFieldProps {
  group: MenuOptionGroup
  selected: number[]
  onToggle: (optionId: number) => void
  hasError: boolean
  dukan: boolean
}

function OptionGroupField({ group, selected, onToggle, hasError, dukan }: OptionGroupFieldProps) {
  const single = group.maxSelect === 1
  const full = !single && selected.length >= group.maxSelect
  const charged = new Map(chargedOptions(group, selected).map((o) => [o.optionId, o.price]))
  const freeLeft = Math.max(0, group.freeSelections - selected.length)
  const accent = dukan ? 'accent-dukan' : 'accent-mustard'

  return (
    <fieldset id={`group-${group.id}`} className="scroll-mt-4">
      <legend className="flex w-full items-baseline justify-between gap-3">
        <span className="font-display text-lg font-bold">{group.title}</span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            hasError ? 'bg-danger/20 text-danger' : group.minSelect > 0 ? 'bg-mustard/15 text-mustard' : 'bg-coal text-muted'
          }`}
        >
          {groupRule(group)}
        </span>
      </legend>

      <div className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-coal">
        {group.options.map((option) => {
          const isSelected = selected.includes(option.id)
          const disabled = !option.isAvailable || (full && !isSelected)
          // Before picking, show "Included" while free picks remain; after, show what was actually charged.
          const price = isSelected ? (charged.get(option.id) ?? option.price) : freeLeft > 0 ? 0 : option.price
          return (
            <label
              key={option.id}
              className={`flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors ${
                disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-charcoal'
              }`}
            >
              <input
                type={single && group.minSelect === 1 ? 'radio' : 'checkbox'}
                name={`group-${group.id}`}
                checked={isSelected}
                disabled={disabled}
                onChange={() => onToggle(option.id)}
                className={`size-5 shrink-0 ${accent}`}
              />
              <span className="flex-1">{option.name}</span>
              <span className="text-sm text-muted">
                {!option.isAvailable ? 'Sold out' : price > 0 ? `+${formatPrice(price)}` : group.freeSelections > 0 ? 'Included' : ''}
              </span>
            </label>
          )
        })}
      </div>
      {hasError && (
        <p className="mt-2 text-sm text-danger" role="alert">
          Please {groupRule(group).replace(/^Required · /, '')} to continue.
        </p>
      )}
    </fieldset>
  )
}
