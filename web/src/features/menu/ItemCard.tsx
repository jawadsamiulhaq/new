import { Plus } from 'lucide-react'
import type { MenuCategory, MenuItem } from '../../lib/api'
import { formatPrice } from '../../lib/format'
import { ItemImage } from './ItemImage'
import { useOpenItem } from './useOpenItem'

/** Short hint about what can be customised, e.g. "Make it a meal" for burgers. */
function optionHint(item: MenuItem): string | null {
  if (item.optionGroups.some((g) => g.title.toLowerCase().startsWith('make it a meal'))) return 'Make it a meal +Rs 220'
  const required = item.optionGroups.find((g) => g.minSelect > 0)
  return required ? required.title : null
}

export function ItemCard({ item, category }: { item: MenuItem; category: MenuCategory }) {
  const openItem = useOpenItem()
  const dukan = category.brand === 'BakeDukan'
  const hint = optionHint(item)

  return (
    <button
      type="button"
      onClick={() => openItem(item.slug)}
      className={`group flex w-full gap-4 rounded-card border border-line bg-coal p-3 text-left transition-colors focus-visible:border-mustard ${
        dukan ? 'hover:border-dukan/60' : 'hover:border-mustard/60'
      }`}
    >
      <div className="relative shrink-0">
        <ItemImage
          name={item.name}
          categoryName={category.name}
          imageUrl={item.imageUrl}
          brand={category.brand}
          className="size-24 rounded-xl sm:size-28"
        />
        {!item.isAvailable && (
          <span className="absolute inset-0 grid place-items-center rounded-xl bg-black/70 text-xs font-bold tracking-wider uppercase">
            Sold out
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        <h3 className="font-display text-base font-bold sm:text-lg">{item.name}</h3>
        {item.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{item.description}</p>}
        {!item.description && hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}

        <div className="mt-auto flex items-center justify-between pt-2">
          <span className={`font-display text-lg font-extrabold ${dukan ? 'text-dukan' : 'text-mustard'}`}>
            {formatPrice(item.price)}
          </span>
          {item.isAvailable && (
            <span
              aria-hidden
              className={`grid size-9 place-items-center rounded-full text-on-mustard transition-transform group-hover:scale-110 ${
                dukan ? 'bg-dukan' : 'bg-mustard'
              }`}
            >
              <Plus className="size-5" strokeWidth={2.5} />
            </span>
          )}
        </div>
      </div>
      <span className="sr-only">{item.isAvailable ? `Add ${item.name}` : `${item.name} is sold out`}</span>
    </button>
  )
}
