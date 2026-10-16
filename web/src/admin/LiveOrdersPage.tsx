import { BellRing } from 'lucide-react'
import type { OrderStatus } from '../lib/api'
import { useLiveOrders, useRinger } from './hooks'
import type { AdminOrder } from './adminApi'
import { OrderCard } from './OrderCard'
import { ringer } from './ringer'

const COLUMNS: { title: string; statuses: OrderStatus[]; empty: string }[] = [
  { title: 'New', statuses: ['Placed'], empty: 'No new orders' },
  { title: 'In the kitchen', statuses: ['Accepted', 'Preparing'], empty: 'Nothing cooking' },
  { title: 'Ready / On the way', statuses: ['ReadyForPickup', 'OutForDelivery'], empty: 'Nothing waiting' },
]

export function LiveOrdersPage() {
  const { data: orders, isPending, error } = useLiveOrders()
  useRinger()

  if (isPending) return <div className="h-96 animate-pulse rounded-3xl bg-coal" />
  if (error) return <p className="text-danger">{error.message}</p>

  const finished = orders.filter((o) => ['Completed', 'Rejected', 'Cancelled'].includes(o.order.status)).reverse()

  return (
    <div className="space-y-8">
      {!ringer.started && (
        <div className="flex flex-wrap items-center gap-4 rounded-3xl border-2 border-mustard bg-mustard/10 p-5">
          <BellRing className="size-10 text-mustard" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-extrabold">Turn on the order bell</p>
            <p className="text-sm text-muted">Browsers only play sound after a tap. Start your shift so new orders ring and the screen stays awake.</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => void ringer.start()}>
            Start shift
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        {COLUMNS.map((column) => {
          const list = orders.filter((o) => column.statuses.includes(o.order.status))
          return (
            <section key={column.title} aria-label={column.title} className="space-y-3">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                {column.title}
                <span className={`grid min-w-7 place-items-center rounded-full px-2 text-sm ${column.title === 'New' && list.length > 0 ? 'bg-danger text-cream' : 'bg-coal text-muted'}`}>
                  {list.length}
                </span>
              </h2>
              {list.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">{column.empty}</p>
              ) : (
                list.map((o: AdminOrder) => <OrderCard key={o.id} data={o} />)
              )}
            </section>
          )
        })}
      </div>

      {finished.length > 0 && (
        <section aria-label="Finished in the last hour">
          <h2 className="mb-3 font-display text-lg font-bold text-muted">Finished in the last hour</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {finished.map((o) => (
              <OrderCard key={o.id} data={o} compact />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
