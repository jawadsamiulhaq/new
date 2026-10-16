import { Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import type { MenuCategory } from '../lib/api'
import { useMenu } from '../lib/queries'
import { ItemCard } from '../features/menu/ItemCard'
import { LoadError, MenuSkeleton } from '../components/States'
import { usePageTitle } from '../lib/usePageTitle'

export function MenuPage() {
  usePageTitle('Menu')
  const { data: menu, isPending, isError, refetch } = useMenu()
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!menu || !q) return null
    return menu.categories
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (i) => i.name.toLowerCase().includes(q) || (i.description ?? '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
        ),
      }))
      .filter((c) => c.items.length > 0)
  }, [menu, query])

  // Arriving from a link like /menu#wraps: jump to that category once the menu has rendered.
  const { hash } = useLocation()
  useEffect(() => {
    if (!menu || !hash) return
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView()
  }, [menu, hash])

  if (isPending) return <MenuSkeleton />
  if (isError) return <LoadError onRetry={() => refetch()} />

  const categories = results ?? menu.categories

  return (
    <div>
      <div className="mx-auto max-w-6xl px-4 pt-8">
        <h1 className="text-4xl font-extrabold sm:text-5xl">Menu</h1>
        <p className="mt-1 text-muted">Burgers are 100g. Prices in PKR, taxes included.</p>

        <div className="relative mt-5 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search burgers, wings, desserts…"
            aria-label="Search the menu"
            className="w-full rounded-full border border-line bg-coal py-3 pr-11 pl-12 text-cream placeholder:text-muted/70 focus:border-mustard focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-3 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-cream"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {!results && <CategoryTabs categories={menu.categories} />}

      <div className="mx-auto max-w-6xl space-y-12 px-4 pt-6">
        {categories.length === 0 && (
          <p className="py-16 text-center text-muted">
            Nothing matches “{query}”. Try “zinger”, “wrap” or “brownie”.
          </p>
        )}
        {categories.map((category) => (
          <section key={category.id} id={category.slug} aria-labelledby={`${category.slug}-title`} className="scroll-mt-36">
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id={`${category.slug}-title`} className={`section-bar ${category.brand === 'BakeDukan' ? 'text-dukan' : ''}`}>
                {category.name}
              </h2>
              {category.description && <p className="text-sm text-muted">{category.description}</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {category.items.map((item) => (
                <ItemCard key={item.id} item={item} category={category} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

/** Sticky, horizontally scrollable category tabs that follow the section in view. */
function CategoryTabs({ categories }: { categories: MenuCategory[] }) {
  const [active, setActive] = useState(categories[0]?.slug)
  const tabsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      // A thin band just below the sticky header + tabs decides which section is "current".
      { rootMargin: '-150px 0px -60% 0px' },
    )
    categories.forEach((c) => {
      const el = document.getElementById(c.slug)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [categories])

  useEffect(() => {
    const tab = tabsRef.current?.querySelector<HTMLElement>(`[data-slug="${active}"]`)
    tab?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [active])

  return (
    <nav aria-label="Menu categories" className="sticky top-16 z-20 mt-6 border-y border-line bg-ink/95 backdrop-blur">
      <div ref={tabsRef} className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
        {categories.map((c) => {
          const isActive = c.slug === active
          const dukan = c.brand === 'BakeDukan'
          return (
            <a
              key={c.id}
              href={`#${c.slug}`}
              data-slug={c.slug}
              aria-current={isActive ? 'true' : undefined}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(c.slug)?.scrollIntoView({ behavior: 'smooth' })
                setActive(c.slug)
              }}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
                isActive
                  ? dukan
                    ? 'bg-dukan text-on-mustard'
                    : 'bg-mustard text-on-mustard'
                  : 'border border-line text-cream hover:border-mustard'
              }`}
            >
              {c.name}
            </a>
          )
        })}
      </div>
    </nav>
  )
}
