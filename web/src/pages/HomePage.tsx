import { ArrowRight, MapPin, Phone } from 'lucide-react'
import { Link } from 'react-router'
import { categoryIcon } from '../features/menu/categoryIcon'
import { ItemCard } from '../features/menu/ItemCard'
import { digitsOnly, formatHours, shopWeekday } from '../lib/hours'
import { useMenu, useStore } from '../lib/queries'
import { usePageTitle } from '../lib/usePageTitle'
import { StatusPill } from '../layout/StoreStatus'

export function HomePage() {
  usePageTitle()
  const { data: menu } = useMenu()
  const { data: store } = useStore()

  const featured = menu?.categories.flatMap((c) => c.items.filter((i) => i.isFeatured).map((item) => ({ item, category: c }))) ?? []
  const desserts = menu?.categories.find((c) => c.brand === 'BakeDukan')
  const weekday = store ? shopWeekday(store.timeZone) : null
  const today = store?.hours.find((h) => h.day === weekday)

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at 15% 20%, rgb(242 194 48 / 0.18), transparent 45%), radial-gradient(circle at 90% 80%, rgb(232 160 191 / 0.12), transparent 40%)',
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <StatusPill className="inline-flex bg-ink/60" />
          <p className="mt-6 text-xs font-bold tracking-[0.25em] text-muted uppercase sm:text-sm">
            Good food <span className="text-mustard">+</span> sweet treats <span className="text-mustard">+</span> under one roof
          </p>
          <h1 className="mt-3 max-w-3xl text-5xl leading-[0.95] font-extrabold sm:text-7xl">
            Burgers. Grilled chicken. <span className="text-mustard">Wraps.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Crispy, saucy, made fresh in DHA Phase 8 — plus <span className="text-dukan">Bake Dukan</span> desserts. Order online for
            delivery or pick-up.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/menu" className="btn-primary px-8 text-lg">
              Order now <ArrowRight className="size-5" />
            </Link>
            {store && (
              <a href={`tel:${digitsOnly(store.phone)}`} className="btn-ghost">
                <Phone className="size-4" /> {store.phone}
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Categories — placeholders hold the space while the menu loads, so nothing below jumps. */}
      <section className="mx-auto max-w-6xl px-4 pt-14" aria-labelledby="categories-title" aria-busy={!menu}>
        <h2 id="categories-title" className="text-2xl font-extrabold sm:text-3xl">
          What are you craving?
        </h2>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {!menu && Array.from({ length: 10 }, (_, i) => <div key={i} className="h-[118px] animate-pulse rounded-card bg-coal" />)}
          {menu?.categories.map((c) => {
              const dukan = c.brand === 'BakeDukan'
              return (
                <Link
                  key={c.id}
                  to={`/menu#${c.slug}`}
                  className={`group flex flex-col items-start gap-3 rounded-card border border-line bg-coal p-4 transition-colors ${
                    dukan ? 'hover:border-dukan/60' : 'hover:border-mustard/60'
                  }`}
                >
                  {categoryIcon([c.name], {
                    className: `size-8 ${dukan ? 'text-dukan' : 'text-mustard'}`,
                    strokeWidth: 1.75,
                    'aria-hidden': true,
                  })}
                  <span className="font-display font-bold leading-tight">{c.name}</span>
                  <span className="text-xs text-muted">{c.items.length} items</span>
                </Link>
              )
            })}
        </div>
      </section>

      {/* Popular picks */}
      {(!menu || featured.length > 0) && (
        <section className="mx-auto max-w-6xl px-4 pt-14" aria-labelledby="popular-title" aria-busy={!menu}>
          <div className="flex items-end justify-between gap-4">
            <h2 id="popular-title" className="text-2xl font-extrabold sm:text-3xl">
              Popular picks
            </h2>
            <Link to="/menu" className="text-sm font-semibold text-mustard hover:underline">
              Full menu →
            </Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {!menu && Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[122px] animate-pulse rounded-card bg-coal sm:h-[138px]" />)}
            {featured.map(({ item, category }) => (
              <ItemCard key={item.id} item={item} category={category} />
            ))}
          </div>
        </section>
      )}

      {/* Make it a meal */}
      <section className="mx-auto max-w-6xl px-4 pt-14">
        <div className="flex flex-col items-start justify-between gap-5 rounded-3xl border-2 border-mustard bg-charcoal p-6 sm:flex-row sm:items-center sm:p-8">
          <div>
            <p className="font-display text-3xl font-extrabold sm:text-4xl">
              Make it a <span className="text-mustard">meal!</span>
            </p>
            <p className="mt-1 text-muted">Add fries + a drink to any burger or wrap.</p>
          </div>
          <span className="rounded-full bg-mustard px-5 py-2 font-display text-xl font-extrabold text-on-mustard">+Rs 220</span>
        </div>
      </section>

      {/* Bake Dukan — shown straight away (with a default line) so it never pops in late. */}
      <section className="mx-auto max-w-6xl px-4 pt-14">
        <div className="relative overflow-hidden rounded-3xl bg-dukan/10 p-6 ring-1 ring-dukan/30 sm:p-10">
          <p className="text-xs font-bold tracking-[0.25em] text-dukan uppercase">Sweet treats by</p>
          <p className="mt-1 font-display text-4xl font-extrabold text-dukan sm:text-5xl">Bake Dukan</p>
          <p className="mt-3 max-w-lg text-muted">
            {desserts
              ? desserts.items
                  .slice(0, 4)
                  .map((i) => i.name)
                  .join(', ')
              : 'Sundaes, brownies, Milk Bath, tiramisu'}{' '}
            and more — made under the same roof.
          </p>
          <Link
            to={`/menu#${desserts?.slug ?? 'bake-dukan-desserts'}`}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-dukan px-6 py-3 font-display font-bold text-on-mustard hover:bg-dukan-dark"
          >
            See desserts <ArrowRight className="size-5" />
          </Link>
        </div>
      </section>

      {/* Find us */}
      {store && (
        <section className="mx-auto max-w-6xl px-4 pt-14" aria-labelledby="find-title">
          <div className="grid gap-6 rounded-3xl border border-line bg-coal p-6 sm:grid-cols-2 sm:p-8">
            <div className="space-y-3">
              <h2 id="find-title" className="text-2xl font-extrabold">
                Find us
              </h2>
              <p className="flex gap-2 text-muted">
                <MapPin className="mt-0.5 size-5 shrink-0 text-mustard" aria-hidden />
                {store.address}
              </p>
              {today && (
                <p className="text-muted">
                  Today: <span className="text-cream">{formatHours(today)}</span>
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:justify-end">
              <Link to="/about" className="btn-ghost">
                Hours &amp; map
              </Link>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`}
                target="_blank"
                rel="noreferrer"
                className="btn-primary"
              >
                Get directions
              </a>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
