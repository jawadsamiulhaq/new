import { Bike, MapPin, MessageSquareText, Phone, Store as StoreIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { OrderStatus } from '../lib/api'
import { formatPrice } from '../lib/format'
import { formatTime } from '../lib/hours'
import { STATUS_LABEL } from '../features/orders/orderStatus'
import { adminApi, type AdminOrder } from './adminApi'
import { useAdminMutation } from './hooks'
import { AdminDialog, Badge, Field, inputClass } from './ui'

/** Button label for moving an order to a status. */
function actionLabel(status: OrderStatus, type: string): string {
  switch (status) {
    case 'Accepted':
      return 'Accept'
    case 'Preparing':
      return 'Start preparing'
    case 'OutForDelivery':
      return 'Out for delivery'
    case 'ReadyForPickup':
      return 'Ready for pick-up'
    case 'Completed':
      return type === 'Delivery' ? 'Delivered' : 'Picked up'
    case 'Rejected':
      return 'Reject'
    case 'Cancelled':
      return 'Cancel'
    default:
      return STATUS_LABEL[status]
  }
}

const REJECT_REASONS = ['Item sold out', 'Kitchen too busy right now', 'We don’t deliver to that address', 'Closing soon']

/** Re-renders every 30s so "x min ago" stays current. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

export function OrderCard({ data, compact = false }: { data: AdminOrder; compact?: boolean }) {
  const { order, nextStatuses, id } = data
  const now = useNow()
  const [reasonFor, setReasonFor] = useState<OrderStatus | null>(null)
  const [reason, setReason] = useState('')

  const change = useAdminMutation((args: { status: OrderStatus; note?: string }) => adminApi.setStatus(id, args.status, args.note), {
    invalidate: [['admin', 'live'], ['admin', 'orders'], ['admin', 'order', id]],
    onSuccess: () => {
      setReasonFor(null)
      setReason('')
    },
  })

  const minutes = Math.max(0, Math.round((now - new Date(order.placedAt ?? order.createdAt).getTime()) / 60_000))
  const isNew = order.status === 'Placed'
  const late = !['Completed', 'Rejected', 'Cancelled'].includes(order.status) && minutes > 45
  const forward = nextStatuses.filter((s) => s !== 'Rejected' && s !== 'Cancelled')
  const negative = nextStatuses.filter((s) => s === 'Rejected' || s === 'Cancelled')

  return (
    <article
      className={`rounded-2xl border-2 bg-charcoal p-4 ${isNew ? 'border-danger shadow-[0_0_0_4px_rgb(248_113_113/0.15)]' : 'border-line'}`}
      aria-label={`Order ${order.orderNumber}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-2xl font-extrabold">#{order.orderNumber}</p>
          <p className={`text-xs ${late ? 'font-bold text-danger' : 'text-muted'}`}>
            {formatTime(order.placedAt ?? order.createdAt)} · {minutes} min ago
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={order.type === 'Delivery' ? 'mustard' : 'dukan'}>
            {order.type === 'Delivery' ? <Bike className="mr-1 size-3.5" /> : <StoreIcon className="mr-1 size-3.5" />}
            {order.type === 'Delivery' ? 'Delivery' : 'Pick-up'}
          </Badge>
          <Badge tone={order.status === 'Rejected' || order.status === 'Cancelled' ? 'danger' : order.status === 'Completed' ? 'success' : 'muted'}>
            {STATUS_LABEL[order.status]}
          </Badge>
        </div>
      </header>

      <div className="mt-3 space-y-1 text-sm">
        <p className="font-semibold">{order.customerName}</p>
        <a href={`tel:${order.customerPhone.replace(/\D/g, '')}`} className="flex items-center gap-1.5 text-mustard hover:underline">
          <Phone className="size-3.5" /> {order.customerPhone}
        </a>
        {order.type === 'Delivery' && (
          <p className="flex gap-1.5 text-muted">
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <span className="text-cream">{order.addressLine}</span> · {order.deliveryAreaName}
              {order.landmark && ` · ${order.landmark}`}
            </span>
          </p>
        )}
      </div>

      {!compact && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
          {order.items.map((item, i) => (
            <li key={i}>
              <p>
                <span className="font-bold text-mustard">{item.quantity}×</span> <span className="font-semibold">{item.name}</span>
              </p>
              {item.options.length > 0 && <p className="pl-5 text-muted">{item.options.map((o) => o.name).join(' · ')}</p>}
              {item.note && <p className="pl-5 font-semibold text-dukan">“{item.note}”</p>}
            </li>
          ))}
        </ul>
      )}

      {order.notes && (
        <p className="mt-3 flex gap-1.5 rounded-xl bg-mustard/10 px-3 py-2 text-sm">
          <MessageSquareText className="mt-0.5 size-4 shrink-0 text-mustard" /> {order.notes}
        </p>
      )}
      {order.rejectReason && <p className="mt-3 text-sm text-danger">Reason: {order.rejectReason}</p>}

      <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-sm text-muted">
          {order.paymentMethod === 'Cod' ? (order.type === 'Delivery' ? 'Cash on delivery' : 'Pay at pick-up') : `Online · ${order.paymentStatus}`}
          {order.discount > 0 && ` · ${order.promoCode} −${formatPrice(order.discount)}`}
        </span>
        <span className="font-display text-xl font-extrabold">{formatPrice(order.total)}</span>
      </div>

      {nextStatuses.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {forward.map((status) => (
            <button
              key={status}
              type="button"
              disabled={change.isPending}
              onClick={() => change.mutate({ status })}
              className={`btn-primary flex-1 py-3 text-base ${status === 'Accepted' ? 'bg-success hover:bg-success/80' : ''}`}
            >
              {actionLabel(status, order.type)}
            </button>
          ))}
          {negative.map((status) => (
            <button key={status} type="button" disabled={change.isPending} onClick={() => setReasonFor(status)} className="btn-ghost py-3 text-danger hover:border-danger hover:text-danger">
              {actionLabel(status, order.type)}
            </button>
          ))}
        </div>
      )}

      <AdminDialog
        open={reasonFor !== null}
        onOpenChange={(open) => !open && setReasonFor(null)}
        title={`${reasonFor === 'Rejected' ? 'Reject' : 'Cancel'} order #${order.orderNumber}?`}
        footer={
          <button
            type="button"
            className="btn-primary bg-danger hover:bg-danger/80"
            disabled={!reason.trim() || change.isPending}
            onClick={() => reasonFor && change.mutate({ status: reasonFor, note: reason })}
          >
            {reasonFor === 'Rejected' ? 'Reject order' : 'Cancel order'}
          </button>
        }
      >
        <p className="text-sm text-muted">The customer sees this reason on their order page. Please also call them if possible.</p>
        <div className="flex flex-wrap gap-2">
          {REJECT_REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} className="rounded-full border border-line px-3 py-1 text-xs hover:border-mustard">
              {r}
            </button>
          ))}
        </div>
        <Field label="Reason" htmlFor={`reason-${id}`}>
          <input id={`reason-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={inputClass} />
        </Field>
      </AdminDialog>
    </article>
  )
}
