import { lazy, Suspense, useState } from 'react'
import { Outlet, ScrollRestoration } from 'react-router'
import { Toaster } from '../components/Toaster'
import { useCart } from '../features/cart/cartStore'
import { ItemDialogHost } from '../features/menu/itemDialogHost'
import { Footer } from './Footer'
import { Header } from './Header'
import { MobileCartBar } from './MobileCartBar'
import { StoreStatusBanner } from './StoreStatus'

// The cart panel is loaded the first time it's opened, keeping the first page load light.
const CartDrawer = lazy(() => import('../features/cart/CartDrawer').then((m) => ({ default: m.CartDrawer })))

export function SiteLayout() {
  const cartOpen = useCart((s) => s.isOpen)
  const [cartUsed, setCartUsed] = useState(false)
  if (cartOpen && !cartUsed) setCartUsed(true)

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-mustard focus:px-4 focus:py-2 focus:text-on-mustard">
        Skip to content
      </a>
      <Header />
      <StoreStatusBanner />
      <main id="main" className="flex-1 pb-24 sm:pb-0">
        <Outlet />
      </main>
      <Footer />
      <MobileCartBar />
      {cartUsed && (
        <Suspense fallback={null}>
          <CartDrawer />
        </Suspense>
      )}
      <ItemDialogHost />
      <Toaster />
      <ScrollRestoration />
    </div>
  )
}
