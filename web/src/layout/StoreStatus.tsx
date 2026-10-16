import { Clock } from 'lucide-react'
import { storeStatusText } from '../lib/hours'
import { useStore } from '../lib/queries'

const toneDot = {
  open: 'bg-success',
  closed: 'bg-danger',
  paused: 'bg-mustard',
} as const

/** Compact "● Open now · until 2:00 AM" chip. */
export function StatusPill({ className = '' }: { className?: string }) {
  const { data: store } = useStore()
  // Keep the pill's space while loading so the page doesn't jump when it appears.
  if (!store) return <span aria-hidden className={`h-[30px] w-40 animate-pulse rounded-full bg-coal ${className}`} />
  const text = storeStatusText(store)

  return (
    <span className={`items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-semibold ${className}`}>
      <span className={`size-2 rounded-full ${toneDot[text.tone]}`} aria-hidden />
      {text.label}
      {text.tone === 'open' && text.detail && <span className="font-normal text-muted">{text.detail}</span>}
    </span>
  )
}

/** Full-width notice under the header whenever online ordering isn't possible. */
export function StoreStatusBanner() {
  const { data: store } = useStore()
  if (!store || store.status.canOrder) return null
  const text = storeStatusText(store)

  return (
    <div role="status" className="border-b border-mustard/30 bg-mustard/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-2.5 text-center text-sm">
        <Clock className="size-4 text-mustard" aria-hidden />
        <span className="font-bold text-mustard">{text.label}.</span>
        <span>{text.detail}</span>
        <span className="text-muted">You can still browse the menu.</span>
      </div>
    </div>
  )
}
