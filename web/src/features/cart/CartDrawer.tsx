import * as Dialog from '@radix-ui/react-dialog'
import { ShoppingBag, Trash2, X } from 'lucide-react'
import { Link } from 'react-router'
import { formatPrice } from '../../lib/format'
import { storeStatusText } from '../../lib/hours'
import { useMenu, useStore } from '../../lib/queries'
import { QuantityStepper } from '../../components/QuantityStepper'
import { useCart } from './cartStore'
import { liveCart, liveSubtotal } from './liveCart'

export function CartDrawer() {
  const { lines, isOpen, setOpen, setQuantity, remove } = useCart()
  const { data: menu } = useMenu()
  const { data: store } = useStore()

  const live = liveCart(lines, menu)
  const subtotal = liveSubtotal(live)
  const hasProblems = live.some((l) => l.problem)
  const canOrder = store?.status.canOrder ?? false
  const closedText = store && !canOrder ? storeStatusText(store) : null

  return (
    <Dialog.Root open={isOpen} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm data-[state=open]:animate-[fade-in_150ms]" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-ink shadow-2xl outline-none data-[state=open]:animate-[slide-in-right_200ms_ease-out]"
          aria-describedby={undefined}
        >
          <header className="flex items-center justify-between border-b border-line px-5 py-4">
            <Dialog.Title className="font-display text-xl font-extrabold">Your order</Dialog.Title>
            <Dialog.Close className="grid size-10 place-items-center rounded-full hover:bg-coal" aria-label="Close cart">
              <X className="size-5" />
            </Dialog.Close>
          </header>

          {lines.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <ShoppingBag className="size-14 text-line" strokeWidth={1.5} />
              <p className="font-display text-lg font-bold">Your cart is empty</p>
              <p className="text-muted">Hungry? Pick something tasty from the menu.</p>
              <Link to="/menu" onClick={() => setOpen(false)} className="btn-primary">
                Browse the menu
              </Link>
            </div>
          ) : (
            <>
              <ul className="flex-1 divide-y divide-line overflow-y-auto overscroll-contain px-5">
                {live.map(({ line, unitPrice, problem }) => (
                  <li key={line.key} className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{line.name}</p>
                        {line.options.length > 0 && (
                          <p className="mt-0.5 text-sm text-muted">
                            {line.options.map((o) => (o.price > 0 ? `${o.name} (+${formatPrice(o.price)})` : o.name)).join(' · ')}
                          </p>
                        )}
                        {line.note && <p className="mt-0.5 text-sm text-muted italic">“{line.note}”</p>}
                        {problem && (
                          <p className="mt-1 text-sm font-semibold text-danger">
                            {problem === 'soldOut' ? 'Sold out right now — please remove' : 'No longer available — please remove'}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(line.key)}
                        className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-coal hover:text-danger"
                        aria-label={`Remove ${line.name}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <QuantityStepper size="sm" value={line.quantity} onChange={(q) => setQuantity(line.key, q)} />
                      <span className={`font-display font-bold ${problem ? 'text-muted line-through' : ''}`}>
                        {formatPrice(unitPrice * line.quantity)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              <footer className="space-y-3 border-t border-line bg-charcoal p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <div className="flex items-baseline justify-between">
                  <span className="text-muted">Subtotal</span>
                  <span className="font-display text-xl font-extrabold">{formatPrice(subtotal)}</span>
                </div>
                <p className="text-xs text-muted">Delivery fee and any promo code are applied at checkout.</p>

                {closedText && (
                  <p className="rounded-xl bg-coal px-3 py-2 text-sm">
                    <span className="font-semibold text-mustard">{closedText.label}.</span> {closedText.detail}
                  </p>
                )}

                {canOrder && !hasProblems ? (
                  <Link to="/checkout" onClick={() => setOpen(false)} className="btn-primary w-full">
                    Checkout · {formatPrice(subtotal)}
                  </Link>
                ) : (
                  <button type="button" className="btn-primary w-full" disabled>
                    {hasProblems ? 'Remove unavailable items' : 'Ordering unavailable right now'}
                  </button>
                )}
              </footer>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
