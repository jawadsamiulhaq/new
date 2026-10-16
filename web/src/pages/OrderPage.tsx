import { useQueryClient } from '@tanstack/react-query'
import { Check, MapPin, Phone, RotateCcw, XCircle } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { PhoneSignIn } from '../features/account/PhoneSignIn'
import { reorderLines } from '../features/cart/cartRequest'
import { useCart } from '../features/cart/cartStore'
import { isFinalStatus, STATUS_LABEL, statusMessage, statusSteps } from '../features/orders/orderStatus'
import { useOrderLive } from '../features/orders/useOrderLive'
import { useToast } from '../components/toastStore'
import { ApiError } from '../lib/api'
import { formatPrice } from '../lib/format'
import { digitsOnly, formatTime } from '../lib/hours'
import { useMenu, useOrder, useStore } from '../lib/queries'
import { usePageTitle } from '../lib/usePageTitle'

export function OrderPage() {
  const { publicId = '' } = useParams()
  const { data: order, error, isPending } = useOrder(publicId)
  const { data: store } = useStore()
  const { data: menu } = useMenu()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const addToCart = useCart((s) => s.add)
  const openCart = useCart((s) => s.open)
  const toast = useToast((s) => s.show)

  usePageTitle(order ? `Order #${order.orderNumber}` : 'Your order')
  useOrderLive(publicId, Boolean(order) && !isFinalStatus(order!.status))

  if (isPending) {
    return <div className="mx-auto h-96 max-w-3xl animate-pulse px-4 pt-8"><div className="h-full rounded-3xl bg-coal" /></div>
  }

  if (error instanceof ApiError && error.status === 401) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-2xl font-extrabold">Sign in to see your order</h1>
        <p className="mt-2 mb-6 text-muted">Use the mobile number you ordered with.</p>
        <PhoneSignIn onSignedIn={() => queryClient.invalidateQueries({ queryKey: ['order', publicId] })} />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <h1 className="text-2xl font-extrabold">Order not found</h1>
        <p className="text-muted">It may belong to a different mobile number.</p>
        <Link to="/orders" className="btn-primary">
          My orders
        </Link>
      </div>
    )
  }

  const failed = order.status === 'Rejected' || order.status === 'Cancelled'
  const steps = statusSteps(order.type)
  const currentStep = steps.indexOf(order.status)
  const reachedAt = (status: string) => order.events.find((e) => e.status === status)?.at

  function reorder() {
    if (!menu || !order) return
    const { lines, skipped } = reorderLines(order, menu)
    lines.forEach(({ line, quantity }) => addToCart(line, quantity))
    if (lines.length > 0) {
      toast(skipped.length ? `Added to cart — ${skipped.join(', ')} unavailable` : 'Added your previous order to the cart')
      openCart()
    } else {
      toast('Those items aren’t available right now')
      navigate('/menu')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 pt-8">
      {/* Status hero */}
      <section className={`rounded-3xl border p-6 sm:p-8 ${failed ? 'border-danger/40 bg-danger/10' : 'border-mustard/40 bg-mustard/10'}`} aria-live="polite">
        <p className="text-sm font-semibold text-muted">Order #{order.orderNumber}</p>
        <h1 className={`mt-1 text-3xl font-extrabold sm:text-4xl ${failed ? 'text-danger' : 'text-mustard'}`}>{STATUS_LABEL[order.status]}</h1>
        <p className="mt-2 text-lg">{statusMessage(order.status, order.type)}</p>
        {order.rejectReason && <p className="mt-2 text-muted">Reason: {order.rejectReason}</p>}
        {!failed && !isFinalStatus(order.status) && order.estimatedReadyAt && (
          <p className="mt-3 text-sm text-muted">
            Estimated {order.type === 'Delivery' ? 'delivery' : 'ready'} by <span className="font-semibold text-cream">{formatTime(order.estimatedReadyAt)}</span>
          </p>
        )}

        {!failed && (
          <ol className="mt-6 grid grid-cols-5 gap-1" aria-label="Order progress">
            {steps.map((step, i) => {
              const done = currentStep >= i
              const at = reachedAt(step)
              return (
                <li key={step} className="flex flex-col items-center gap-2 text-center">
                  <span className={`grid size-9 place-items-center rounded-full border-2 ${done ? 'border-mustard bg-mustard text-on-mustard' : 'border-line text-muted'}`}>
                    {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={`text-[0.7rem] leading-tight sm:text-xs ${done ? 'font-semibold' : 'text-muted'}`}>{STATUS_LABEL[step]}</span>
                  {at && <span className="text-[0.65rem] text-muted">{formatTime(at)}</span>}
                </li>
              )
            })}
          </ol>
        )}
        {failed && <XCircle className="mt-4 size-10 text-danger" aria-hidden />}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-3xl border border-line bg-charcoal p-5">
          <h2 className="font-display text-lg font-bold">{order.type === 'Delivery' ? 'Delivering to' : 'Pick up from'}</h2>
          <p className="mt-2 flex gap-2 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <span>
              {order.type === 'Delivery' ? (
                <>
                  {order.addressLine}
                  <span className="block text-muted">
                    {order.deliveryAreaName}
                    {order.landmark ? ` · ${order.landmark}` : ''}
                  </span>
                </>
              ) : (
                store?.address
              )}
            </span>
          </p>
          <p className="mt-3 text-sm text-muted">
            {order.customerName} · {order.customerPhone}
          </p>
          {order.notes && <p className="mt-2 text-sm text-muted italic">“{order.notes}”</p>}
        </section>

        <section className="rounded-3xl border border-line bg-charcoal p-5">
          <h2 className="font-display text-lg font-bold">Payment</h2>
          <p className="mt-2 text-sm">
            {order.paymentMethod === 'Cod'
              ? order.type === 'Delivery'
                ? `Cash on delivery — please have ${formatPrice(order.total)} ready.`
                : `Pay ${formatPrice(order.total)} at pick-up.`
              : `Online payment · ${order.paymentStatus}`}
          </p>
          {store && (
            <a href={`tel:${digitsOnly(store.phone)}`} className="btn-ghost mt-4">
              <Phone className="size-4" /> Call {store.phone}
            </a>
          )}
        </section>
      </div>

      <section className="rounded-3xl border border-line bg-charcoal p-5">
        <h2 className="font-display text-lg font-bold">Items</h2>
        <ul className="mt-2 divide-y divide-line">
          {order.items.map((item, i) => (
            <li key={i} className="flex justify-between gap-3 py-2.5 text-sm">
              <span>
                <span className="font-semibold">
                  {item.quantity}× {item.name}
                </span>
                {item.options.length > 0 && <span className="block text-muted">{item.options.map((o) => o.name).join(' · ')}</span>}
                {item.note && <span className="block text-muted italic">“{item.note}”</span>}
              </span>
              <span className="shrink-0 font-semibold">{formatPrice(item.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-1.5 border-t border-line pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatPrice(order.subtotal)}</dd></div>
          {order.discount > 0 && <div className="flex justify-between text-success"><dt>Discount ({order.promoCode})</dt><dd>−{formatPrice(order.discount)}</dd></div>}
          {order.type === 'Delivery' && <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd>{order.deliveryFee === 0 ? 'Free' : formatPrice(order.deliveryFee)}</dd></div>}
          {order.tax > 0 && <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd>{formatPrice(order.tax)}</dd></div>}
          <div className="flex items-baseline justify-between border-t border-line pt-2">
            <dt className="font-display font-bold">Total</dt>
            <dd className="font-display text-xl font-extrabold text-mustard">{formatPrice(order.total)}</dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={reorder} className="btn-primary" disabled={!menu}>
          <RotateCcw className="size-4" /> Order again
        </button>
        <Link to="/orders" className="btn-ghost">
          All my orders
        </Link>
      </div>
    </div>
  )
}
