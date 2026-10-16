import type { Menu, MenuItem } from '../../lib/api'
import { unitPrice, type Selections } from '../../lib/pricing'
import type { CartLine } from './cartStore'

export type LineProblem = 'unavailable' | 'soldOut' | null

export interface LiveLine {
  line: CartLine
  /** Current price from the live menu (falls back to the saved price if the menu isn't loaded). */
  unitPrice: number
  problem: LineProblem
}

function findItem(menu: Menu, id: number): MenuItem | undefined {
  for (const category of menu.categories) {
    const item = category.items.find((i) => i.id === id)
    if (item) return item
  }
  return undefined
}

/**
 * Re-checks saved cart lines against the current menu, so a price change or a sold-out
 * item shows up before checkout instead of surprising the customer there.
 */
export function liveCart(lines: CartLine[], menu: Menu | undefined): LiveLine[] {
  return lines.map((line) => {
    if (!menu) return { line, unitPrice: line.unitPrice, problem: null }

    const item = findItem(menu, line.menuItemId)
    if (!item) return { line, unitPrice: line.unitPrice, problem: 'unavailable' }

    const options = item.optionGroups.flatMap((g) => g.options)
    const missing = line.options.some((chosen) => {
      const option = options.find((o) => o.id === chosen.optionId)
      return !option || !option.isAvailable
    })
    if (missing) return { line, unitPrice: line.unitPrice, problem: 'unavailable' }

    const selections: Selections = {}
    for (const chosen of line.options) {
      ;(selections[chosen.groupId] ??= []).push(chosen.optionId)
    }

    return {
      line,
      unitPrice: unitPrice(item, selections),
      problem: item.isAvailable ? null : 'soldOut',
    }
  })
}

export function liveSubtotal(lines: LiveLine[]): number {
  return lines.filter((l) => !l.problem).reduce((sum, l) => sum + l.unitPrice * l.line.quantity, 0)
}
