import { ShoppingBag } from 'lucide-react'
import { useLocation } from 'react-router'
import { cartCount, cartSubtotal, useCart } from '../features/cart/cartStore'
import { formatPrice } from '../lib/format'

/** Thumb-friendly "View cart" bar pinned to the bottom on phones once something is in the cart. */
export function MobileCartBar() {
  const lines = useCart((s) => s.lines)
  const openCart = useCart((s) => s.open)
  const { pathname } = useLocation()
  const count = cartCount(lines)

  if (count === 0 || pathname.startsWith('/checkout')) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
      <button type="button" onClick={openCart} className="btn-primary w-full justify-between shadow-2xl shadow-black/60">
        <span className="flex items-center gap-2">
          <ShoppingBag className="size-5" />
          View cart · {count}
        </span>
        <span>{formatPrice(cartSubtotal(lines))}</span>
      </button>
    </div>
  )
}
