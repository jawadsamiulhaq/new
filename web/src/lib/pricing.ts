/**
 * Display-side pricing for one configured item. The server recomputes everything
 * at checkout, so this only has to match it — it is never trusted.
 */
import type { MenuItem, MenuOptionGroup } from './api'

/** Selected option ids per option-group attachment id. */
export type Selections = Record<number, number[]>

export interface ChosenOption {
  groupId: number
  groupTitle: string
  optionId: number
  name: string
  /** What this choice adds to the price (0 when it is one of the free selections). */
  price: number
}

/** A group is visible unless it depends on an option that isn't selected (e.g. meal drink). */
export function isGroupVisible(group: MenuOptionGroup, selections: Selections): boolean {
  if (group.dependsOnOptionId === null) return true
  return Object.values(selections).some((ids) => ids.includes(group.dependsOnOptionId!))
}

export function visibleGroups(item: MenuItem, selections: Selections): MenuOptionGroup[] {
  return item.optionGroups.filter((g) => isGroupVisible(g, selections))
}

/** Charged price of each selected option; the most expensive `freeSelections` picks are free. */
export function chargedOptions(group: MenuOptionGroup, selectedIds: number[]): ChosenOption[] {
  const chosen = group.options.filter((o) => selectedIds.includes(o.id))
  const freeIds = new Set(
    [...chosen]
      .sort((a, b) => b.price - a.price)
      .slice(0, group.freeSelections)
      .map((o) => o.id),
  )
  return chosen.map((o) => ({
    groupId: group.id,
    groupTitle: group.title,
    optionId: o.id,
    name: o.name,
    price: freeIds.has(o.id) ? 0 : o.price,
  }))
}

/** All charged choices for the item, ignoring selections in hidden groups. */
export function chosenOptions(item: MenuItem, selections: Selections): ChosenOption[] {
  return visibleGroups(item, selections).flatMap((g) => chargedOptions(g, selections[g.id] ?? []))
}

export function unitPrice(item: MenuItem, selections: Selections): number {
  return item.price + chosenOptions(item, selections).reduce((sum, o) => sum + o.price, 0)
}

/** Groups whose selection count is outside min/max. Empty = ready to add to cart. */
export function invalidGroups(item: MenuItem, selections: Selections): MenuOptionGroup[] {
  return visibleGroups(item, selections).filter((g) => {
    const count = (selections[g.id] ?? []).length
    return count < g.minSelect || count > g.maxSelect
  })
}

/** Short helper text for a group, e.g. "Required · choose 2" or "Optional · up to 4". */
export function groupRule(group: MenuOptionGroup): string {
  const { minSelect: min, maxSelect: max } = group
  if (min === 0) return max === 1 ? 'Optional' : `Optional · up to ${max}`
  if (min === max) return `Required · choose ${min}`
  return `Required · choose ${min}–${max}`
}
