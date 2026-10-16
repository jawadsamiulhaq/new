import { ShoppingBag, UserRound } from 'lucide-react'
import { Link, NavLink } from 'react-router'
import { cartCount, useCart } from '../features/cart/cartStore'
import { StatusPill } from './StoreStatus'

export function Logo() {
  return (
    <Link to="/" className="flex flex-col leading-none" aria-label="BurChips × Bake Dukan — home">
      <span className="font-display text-2xl font-extrabold tracking-tight">
        Bur<span className="text-mustard">Chips</span>
      </span>
      <span className="mt-0.5 text-[0.65rem] font-semibold tracking-[0.18em] text-muted uppercase">
        × <span className="text-dukan">Bake Dukan</span>
      </span>
    </Link>
  )
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3 py-2 text-sm font-semibold transition-colors ${isActive ? 'text-mustard' : 'text-cream hover:text-mustard'}`

export function Header() {
  const lines = useCart((s) => s.lines)
  const openCart = useCart((s) => s.open)
  const count = cartCount(lines)

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-charcoal/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />

        <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
          <NavLink to="/menu" className={navClass}>
            Menu
          </NavLink>
          <NavLink to="/about" className={navClass}>
            Find us
          </NavLink>
          <NavLink to="/orders" className={navClass}>
            My orders
          </NavLink>
        </nav>

        <div className="flex items-center gap-3">
          <StatusPill className="hidden md:inline-flex" />
          <NavLink to="/menu" className={`${navClass({ isActive: false })} sm:hidden`}>
            Menu
          </NavLink>
          <NavLink to="/orders" className="grid size-10 place-items-center rounded-full text-cream hover:text-mustard sm:hidden" aria-label="My orders">
            <UserRound className="size-5" />
          </NavLink>
          <button
            type="button"
            onClick={openCart}
            className="relative inline-flex items-center gap-2 rounded-full bg-mustard px-4 py-2 font-display font-bold text-on-mustard hover:bg-mustard-dark"
            aria-label={`Open cart, ${count} item${count === 1 ? '' : 's'}`}
          >
            <ShoppingBag className="size-5" />
            <span className="tabular-nums">{count}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
