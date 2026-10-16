import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ChosenOption } from '../../lib/pricing'

export interface CartLine {
  /** Same item + same choices + same note = same key, so repeats merge into one line. */
  key: string
  menuItemId: number
  name: string
  basePrice: number
  options: ChosenOption[]
  unitPrice: number
  quantity: number
  note?: string
}

export type NewCartLine = Omit<CartLine, 'key' | 'quantity'>

interface CartState {
  lines: CartLine[]
  isOpen: boolean
  add: (line: NewCartLine, quantity: number) => void
  setQuantity: (key: string, quantity: number) => void
  remove: (key: string) => void
  clear: () => void
  open: () => void
  setOpen: (open: boolean) => void
}

export const MAX_QUANTITY = 20

function lineKey(line: NewCartLine): string {
  const optionIds = line.options.map((o) => o.optionId).sort((a, b) => a - b)
  return `${line.menuItemId}:${optionIds.join(',')}:${line.note?.trim() ?? ''}`
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      isOpen: false,
      add: (line, quantity) =>
        set((state) => {
          const key = lineKey(line)
          const existing = state.lines.find((l) => l.key === key)
          const lines = existing
            ? state.lines.map((l) =>
                l.key === key ? { ...l, quantity: Math.min(MAX_QUANTITY, l.quantity + quantity) } : l,
              )
            : [...state.lines, { ...line, key, quantity: Math.min(MAX_QUANTITY, quantity) }]
          return { lines }
        }),
      setQuantity: (key, quantity) =>
        set((state) => ({
          lines:
            quantity <= 0
              ? state.lines.filter((l) => l.key !== key)
              : state.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QUANTITY, quantity) } : l)),
        })),
      remove: (key) => set((state) => ({ lines: state.lines.filter((l) => l.key !== key) })),
      clear: () => set({ lines: [] }),
      open: () => set({ isOpen: true }),
      setOpen: (isOpen) => set({ isOpen }),
    }),
    {
      name: 'burchips-cart',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Only the cart contents survive a reload, not whether the drawer was open.
      partialize: (state) => ({ lines: state.lines }),
    },
  ),
)

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0)
}

export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
}
