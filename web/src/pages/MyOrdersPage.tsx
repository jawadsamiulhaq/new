import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, LogOut, Receipt } from 'lucide-react'
import { Link } from 'react-router'
import { PhoneSignIn } from '../features/account/PhoneSignIn'
import { STATUS_LABEL, isFinalStatus } from '../features/orders/orderStatus'
import { api } from '../lib/api'
import { formatPrice } from '../lib/format'
import { useMe, useMyOrders } from '../lib/queries'
import { usePageTitle } from '../lib/usePageTitle'

const dateFormat = new Intl.DateTimeFormat('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Karachi' })

export function MyOrdersPage() {
  usePageTitle('My orders')
  const queryClient = useQueryClient()
  const { data: me, isPending: meLoading } = useMe()
  const { data: orders, isPending } = useMyOrders(Boolean(me))

  if (meLoading) return null

  if (!me) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-3xl font-extrabold">My orders</h1>
        <p className="mt-2 mb-6 text-muted">Sign in with your mobile number to see your orders.</p>
        <PhoneSignIn />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-extrabold">My orders</h1>
          <p className="mt-1 text-muted">{me.phone}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await api.logout()
            queryClient.setQueryData(['me'], null)
            queryClient.removeQueries({ queryKey: ['orders'] })
          }}
          className="btn-ghost text-sm"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </div>

      {isPending ? (
        <div className="mt-8 h-40 animate-pulse rounded-3xl bg-coal" />
      ) : orders && orders.length > 0 ? (
        <ul className="mt-8 space-y-3">
          {orders.map((o) => (
            <li key={o.publicId}>
              <Link to={`/order/${o.publicId}`} className="flex items-center gap-4 rounded-2xl border border-line bg-charcoal p-4 hover:border-mustard/60">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-bold">#{o.orderNumber}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        o.status === 'Rejected' || o.status === 'Cancelled' ? 'bg-danger/15 text-danger' : isFinalStatus(o.status) ? 'bg-coal text-muted' : 'bg-mustard/15 text-mustard'
                      }`}
                    >
                      {STATUS_LABEL[o.status]}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted">{o.itemsPreview}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {dateFormat.format(new Date(o.createdAt))} · {o.type === 'Delivery' ? 'Delivery' : 'Pick-up'}
                  </p>
                </div>
                <span className="font-display font-bold">{formatPrice(o.total)}</span>
                <ChevronRight className="size-5 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <Receipt className="size-14 text-line" strokeWidth={1.5} />
          <p className="text-muted">No orders yet.</p>
          <Link to="/menu" className="btn-primary">
            Order now
          </Link>
        </div>
      )}
    </div>
  )
}
