import type { ComponentType } from 'react'
import { createBrowserRouter } from 'react-router'
import { SiteLayout } from './layout/SiteLayout'
import { HomePage } from './pages/HomePage'
import { MenuPage } from './pages/MenuPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RouteError } from './pages/RouteError'

// Home and menu load with the app; other pages are fetched when first visited.
const lazyPage =
  <M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M) =>
  async () => ({ Component: (await load())[name] as ComponentType })

/** Lazily loads one admin screen from the separate admin bundle. */
const admin = (name: keyof typeof import('./admin')) => lazyPage(() => import('./admin'), name)
const legal = (name: keyof typeof import('./pages/LegalPages')) => lazyPage(() => import('./pages/LegalPages'), name)

export const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'menu', element: <MenuPage /> },
      { path: 'about', lazy: lazyPage(() => import('./pages/AboutPage'), 'AboutPage') },
      { path: 'checkout', lazy: lazyPage(() => import('./pages/CheckoutPage'), 'CheckoutPage') },
      { path: 'order/:publicId', lazy: lazyPage(() => import('./pages/OrderPage'), 'OrderPage') },
      { path: 'orders', lazy: lazyPage(() => import('./pages/MyOrdersPage'), 'MyOrdersPage') },
      { path: 'privacy', lazy: legal('PrivacyPage') },
      { path: 'terms', lazy: legal('TermsPage') },
      { path: 'refunds', lazy: legal('RefundsPage') },
      { path: 'delivery', lazy: legal('DeliveryPolicyPage') },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: 'admin/login', lazy: admin('LoginPage'), errorElement: <RouteError /> },
  {
    path: 'admin',
    lazy: admin('AdminLayout'),
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: admin('LiveOrdersPage') },
      { path: 'orders', lazy: admin('OrderHistoryPage') },
      { path: 'menu', lazy: admin('AdminMenuPage') },
      { path: 'options', lazy: admin('OptionsPage') },
      { path: 'areas', lazy: admin('OwnerAreasPage') },
      { path: 'promos', lazy: admin('OwnerPromosPage') },
      { path: 'reports', lazy: admin('OwnerReportsPage') },
      { path: 'staff', lazy: admin('OwnerStaffPage') },
      { path: 'settings', lazy: admin('OwnerSettingsPage') },
    ],
  },
])
