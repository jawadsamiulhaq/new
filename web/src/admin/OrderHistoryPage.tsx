import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useState } from 'react'
import { STATUS_LABEL } from '../features/orders/orderStatus'
import type { OrderStatus } from '../lib/api'
import { formatPrice } from '../lib/format'
import { adminApi } from './adminApi'
import { OrderCard } from './OrderCard'
import { AdminDialog, Badge, inputClass, PageHeader } from './ui'

const dateTime = new Intl.DateTimeFormat('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Karachi' })
const STATUSES: OrderStatus[] = ['Placed', 'Accepted', 'Preparing', 'OutForDelivery', 'ReadyForPickup', 'Completed', 'Rejected', 'Cancelled', 'PendingPayment']

export function OrderHistoryPage() {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<number | null>(null)

  const params = new URLSearchParams({ page: String(page), pageSize: '25' })
  if (search) params.set('q', search)
  if (status) params.set('status', status)
  if (from) params.set('from', from)
  if (to) params.set('to', to)

  const { data, isFetching } = useQuery({
    queryKey: ['admin', 'orders', params.toString()],
    queryFn: () => adminApi.searchOrders(params),
    placeholderData: keepPreviousData,
  })
  const detail = useQuery({ queryKey: ['admin', 'order', openId], queryFn: () => adminApi.order(openId!), enabled: openId !== null })

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div>
      <PageHeader title="Order history" description="Search by order number, phone or customer name." />

      <form
        className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault()
          setSearch(q.trim())
          setPage(1)
        }}
      >
        <input aria-label="Search orders" value={q} onChange={(e) => setQ(e.target.value)} placeholder="#1042, 0300-1234567 or name" className={inputClass} />
        <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className={inputClass}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <input aria-label="From date" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} className={inputClass} />
        <input aria-label="To date" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} className={inputClass} />
        <button type="submit" className="btn-primary px-4 py-2.5">
          <Search className="size-4" /> Search
        </button>
      </form>

      <div className={`overflow-x-auto rounded-2xl border border-line ${isFetching ? 'opacity-70' : ''}`}>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-charcoal text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Placed</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data?.items.map((o) => (
              <tr key={o.id} className="cursor-pointer hover:bg-coal" onClick={() => setOpenId(o.id)}>
                <td className="px-4 py-3">
                  <button type="button" className="font-display font-bold hover:text-mustard" onClick={() => setOpenId(o.id)}>
                    #{o.orderNumber}
                  </button>
                </td>
                <td className="px-4 py-3 text-muted">{dateTime.format(new Date(o.createdAt))}</td>
                <td className="px-4 py-3">
                  {o.customerName}
                  <span className="block text-xs text-muted">{o.customerPhone}</span>
                </td>
                <td className="px-4 py-3">{o.type === 'Delivery' ? `Delivery · ${o.deliveryAreaName}` : 'Pick-up'}</td>
                <td className="px-4 py-3">
                  <Badge tone={o.status === 'Completed' ? 'success' : o.status === 'Rejected' || o.status === 'Cancelled' ? 'danger' : 'mustard'}>{STATUS_LABEL[o.status]}</Badge>
                </td>
                <td className="px-4 py-3 text-right font-semibold">{formatPrice(o.total)}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No orders match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            {data.total} order{data.total === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-ghost px-3 py-1.5" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button type="button" className="btn-ghost px-3 py-1.5" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}

      <AdminDialog open={openId !== null} onOpenChange={(open) => !open && setOpenId(null)} title={detail.data ? `Order #${detail.data.order.orderNumber}` : 'Order'}>
        {detail.data ? <OrderCard data={detail.data} /> : <div className="h-60 animate-pulse rounded-2xl bg-coal" />}
      </AdminDialog>
    </div>
  )
}
