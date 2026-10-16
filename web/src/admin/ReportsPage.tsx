import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { formatPrice } from '../lib/format'
import { adminApi, type SalesReport } from './adminApi'
import { inputBase, PageHeader } from './ui'

const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(d)
const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86_400_000))
const shortDate = (date: string) =>
  new Intl.DateTimeFormat('en-PK', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))

const PRESETS = [
  { label: 'Today', from: () => daysAgo(0) },
  { label: 'Last 7 days', from: () => daysAgo(6) },
  { label: 'Last 30 days', from: () => daysAgo(29) },
  { label: 'This month', from: () => `${daysAgo(0).slice(0, 8)}01` },
]

export function ReportsPage() {
  const [from, setFrom] = useState(() => daysAgo(6))
  const [to, setTo] = useState(() => daysAgo(0))
  const { data, isPending, error } = useQuery({
    queryKey: ['admin', 'sales', from, to],
    queryFn: () => adminApi.sales(from, to),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Orders that went through — unpaid, rejected and cancelled orders are not counted in sales." />

      {/* Filters in one row above the charts */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => {
          const active = from === p.from() && to === daysAgo(0)
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setFrom(p.from())
                setTo(daysAgo(0))
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${active ? 'bg-mustard text-on-mustard' : 'border border-line hover:border-mustard'}`}
            >
              {p.label}
            </button>
          )
        })}
        <input type="date" aria-label="From" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={`${inputBase} w-auto py-2`} />
        <span className="text-muted">–</span>
        <input type="date" aria-label="To" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={`${inputBase} w-auto py-2`} />
      </div>

      {error && <p className="text-danger">{error.message}</p>}
      {isPending || !data ? <div className="h-96 animate-pulse rounded-3xl bg-coal" /> : <Report data={data} />}
    </div>
  )
}

function Report({ data }: { data: SalesReport }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales" value={formatPrice(data.revenue)} />
        <Stat label="Orders" value={String(data.orders)} />
        <Stat label="Average order" value={formatPrice(data.averageOrder)} />
        <Stat label="Rejected / cancelled" value={`${data.rejected} / ${data.cancelled}`} />
      </div>

      <section className="rounded-2xl border border-line bg-charcoal p-5" aria-labelledby="by-day">
        <h2 id="by-day" className="font-display text-lg font-bold">
          Sales by day
        </h2>
        <DailyBars days={data.byDay} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-charcoal p-5" aria-labelledby="top-items">
          <h2 id="top-items" className="mb-3 font-display text-lg font-bold">
            Top items
          </h2>
          {data.topItems.length === 0 ? (
            <p className="text-sm text-muted">No sales in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted uppercase">
                <tr>
                  <th className="pb-2 text-left">Item</th>
                  <th className="pb-2 text-right">Sold</th>
                  <th className="pb-2 text-right">Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.topItems.map((t) => (
                  <tr key={t.name}>
                    <td className="py-2">{t.name}</td>
                    <td className="py-2 text-right tabular-nums">{t.quantity}</td>
                    <td className="py-2 text-right tabular-nums">{formatPrice(t.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border border-line bg-charcoal p-5" aria-labelledby="split">
          <h2 id="split" className="font-display text-lg font-bold">
            Breakdown
          </h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Pair label="Delivery orders" value={String(data.delivery)} />
            <Pair label="Pick-up orders" value={String(data.pickup)} />
            <Pair label="Cash" value={formatPrice(data.cashRevenue)} />
            <Pair label="Online" value={formatPrice(data.onlineRevenue)} />
            <Pair label="Delivery fees collected" value={formatPrice(data.deliveryFees)} />
            <Pair label="Promo discounts given" value={formatPrice(data.discounts)} />
          </dl>
        </section>
      </div>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-charcoal p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold tabular-nums">{value}</p>
    </div>
  )
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

/** Rounds the axis maximum up to a friendly number (e.g. 23,400 → 25,000). */
function niceMax(value: number): number {
  if (value <= 0) return 1000
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value)!
  return step * magnitude
}

/**
 * Single-series bar chart of daily sales: one validated hue, 4px rounded tops anchored to
 * the baseline, 2px gaps, recessive gridlines, hover/focus tooltip, and a table view.
 */
function DailyBars({ days }: { days: SalesReport['byDay'] }) {
  const [active, setActive] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const max = niceMax(Math.max(...days.map((d) => d.revenue)))
  const ticks = [max, max / 2, 0]
  const labelEvery = Math.ceil(days.length / 8)

  if (asTable) {
    return (
      <div className="mt-3">
        <button type="button" className="mb-3 text-sm text-mustard hover:underline" onClick={() => setAsTable(false)}>
          Show as chart
        </button>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted uppercase">
            <tr>
              <th className="pb-2 text-left">Day</th>
              <th className="pb-2 text-right">Orders</th>
              <th className="pb-2 text-right">Sales</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {days.map((d) => (
              <tr key={d.date}>
                <td className="py-1.5">{shortDate(d.date)}</td>
                <td className="py-1.5 text-right tabular-nums">{d.orders}</td>
                <td className="py-1.5 text-right tabular-nums">{formatPrice(d.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="mt-3">
      <button type="button" className="mb-3 text-sm text-mustard hover:underline" onClick={() => setAsTable(true)}>
        Show as table
      </button>
      <div className="grid grid-cols-[auto_1fr] gap-x-3">
        {/* Y axis labels (muted ink) */}
        <div className="relative h-56 w-16 text-right text-xs text-muted tabular-nums">
          {ticks.map((t, i) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
              {formatPrice(t)}
            </span>
          ))}
        </div>

        <div className="relative h-56" onMouseLeave={() => setActive(null)}>
          {/* Recessive gridlines */}
          {ticks.map((t, i) => (
            <div key={t} aria-hidden className="absolute inset-x-0 border-t border-line/60" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} />
          ))}

          <div className="absolute inset-0 flex items-end gap-[2px]" role="list" aria-label="Sales by day">
            {days.map((d, i) => {
              const height = d.revenue === 0 ? 0 : Math.max(1.5, (d.revenue / max) * 100)
              return (
                <div
                  key={d.date}
                  role="listitem"
                  tabIndex={0}
                  aria-label={`${shortDate(d.date)}: ${formatPrice(d.revenue)} from ${d.orders} orders`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="relative flex h-full flex-1 items-end outline-none focus-visible:bg-cream/5"
                >
                  <div
                    className="w-full rounded-t-[4px] transition-colors"
                    style={{ height: `${height}%`, background: active === i ? 'var(--color-mustard)' : 'var(--color-chart)' }}
                  />
                  {active === i && (
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full z-10 mb-2 rounded-lg border border-line bg-ink px-3 py-2 text-xs whitespace-nowrap shadow-xl"
                      style={i > days.length / 2 ? { right: 0 } : { left: 0 }}
                    >
                      <p className="font-semibold">{shortDate(d.date)}</p>
                      <p className="text-cream tabular-nums">{formatPrice(d.revenue)}</p>
                      <p className="text-muted">
                        {d.orders} order{d.orders === 1 ? '' : 's'}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* X axis labels: a subset so they never collide */}
        <div />
        <div className="mt-2 flex gap-[2px] text-xs text-muted">
          {days.map((d, i) => (
            <span key={d.date} className="flex-1 text-center whitespace-nowrap">
              {i % labelEvery === 0 ? shortDate(d.date) : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
