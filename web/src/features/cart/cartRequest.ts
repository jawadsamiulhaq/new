import type { CartLineRequest, Menu, MenuItem, Order } from '../../lib/api'
import { chosenOptions, invalidGroups, unitPrice, type Selections } from '../../lib/pricing'
import type { CartLine, NewCartLine } from './cartStore'

/** What the server needs: ids and quantities only — never prices. */
export function toRequestLines(lines: CartLine[]): CartLineRequest[] {
  return lines.map((l) => ({
    menuItemId: l.menuItemId,
    quantity: l.quantity,
    optionIds: l.options.map((o) => o.optionId),
    note: l.note,
  }))
}

function findItem(menu: Menu, id: number): MenuItem | undefined {
  return menu.categories.flatMap((c) => c.items).find((i) => i.id === id)
}

/**
 * Rebuilds a past order as cart lines using today's menu and prices.
 * Items that are gone, sold out or whose choices changed are skipped and reported by name.
 */
export function reorderLines(order: Order, menu: Menu): { lines: { line: NewCartLine; quantity: number }[]; skipped: string[] } {
  const lines: { line: NewCartLine; quantity: number }[] = []
  const skipped: string[] = []

  for (const ordered of order.items) {
    const item = ordered.menuItemId === null ? undefined : findItem(menu, ordered.menuItemId)
    if (!item || !item.isAvailable) {
      skipped.push(ordered.name)
      continue
    }

    const selections: Selections = {}
    let missing = false
    for (const option of ordered.options) {
      const group = item.optionGroups.find((g) => g.options.some((o) => o.id === option.optionId && o.isAvailable))
      if (!group || option.optionId === null) {
        missing = true
        break
      }
      ;(selections[group.id] ??= []).push(option.optionId)
    }

    if (missing || invalidGroups(item, selections).length > 0) {
      skipped.push(ordered.name)
      continue
    }

    lines.push({
      line: {
        menuItemId: item.id,
        name: item.name,
        basePrice: item.price,
        options: chosenOptions(item, selections),
        unitPrice: unitPrice(item, selections),
        note: ordered.note ?? undefined,
      },
      quantity: ordered.quantity,
    })
  }

  return { lines, skipped }
}
