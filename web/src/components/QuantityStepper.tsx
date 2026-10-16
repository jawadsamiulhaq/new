import { Minus, Plus } from 'lucide-react'
import { MAX_QUANTITY } from '../features/cart/cartStore'

export function QuantityStepper({
  value,
  onChange,
  size = 'md',
}: {
  value: number
  onChange: (value: number) => void
  size?: 'sm' | 'md'
}) {
  const button =
    size === 'sm'
      ? 'grid size-8 place-items-center rounded-full border border-line hover:border-mustard disabled:opacity-40'
      : 'grid size-11 place-items-center rounded-full border border-line hover:border-mustard disabled:opacity-40'
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={button} onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Decrease quantity">
        <Minus className="size-4" />
      </button>
      <span className="w-6 text-center font-display font-bold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" className={button} onClick={() => onChange(value + 1)} disabled={value >= MAX_QUANTITY} aria-label="Increase quantity">
        <Plus className="size-4" />
      </button>
    </div>
  )
}
