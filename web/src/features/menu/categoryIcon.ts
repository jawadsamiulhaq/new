import {
  CakeSlice,
  Coffee,
  CupSoda,
  Drumstick,
  Flame,
  Hamburger,
  IceCreamCone,
  Popcorn,
  Sandwich,
  Soup,
  Utensils,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react'
import { createElement } from 'react'

/** Picks a placeholder icon from the item/category name, so new categories (e.g. Cakes) work too. */
const ICON_RULES: [RegExp, LucideIcon][] = [
  [/cake/i, CakeSlice],
  [/burger|frankfurter|zinger/i, Hamburger],
  [/wrap/i, Sandwich],
  [/wing|strip/i, Drumstick],
  [/fries|bucket/i, Popcorn],
  [/grilled chicken|spinach|mushroom/i, Flame],
  [/pasta|alfredo/i, Soup],
  [/coffee|cappuccino|chai|tea/i, Coffee],
  [/drink|water|beverage/i, CupSoda],
  [/sundae|cone|ice cream|dessert|brownie|tiramisu|milk bath/i, IceCreamCone],
]

function iconFor(names: string[]): LucideIcon {
  for (const name of names) {
    const match = ICON_RULES.find(([re]) => re.test(name))
    if (match) return match[1]
  }
  return Utensils
}

/** Renders the best-matching food icon for the given names (first match wins). */
export function categoryIcon(names: string[], props: LucideProps) {
  return createElement(iconFor(names), props)
}
