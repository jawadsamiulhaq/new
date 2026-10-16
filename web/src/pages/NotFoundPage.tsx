import { Link } from 'react-router'
import { usePageTitle } from '../lib/usePageTitle'

export function NotFoundPage() {
  usePageTitle('Page not found')
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="font-display text-7xl font-extrabold text-mustard">404</p>
      <h1 className="text-2xl font-extrabold">This page went out for delivery</h1>
      <p className="text-muted">We couldn’t find what you were looking for.</p>
      <Link to="/menu" className="btn-primary">
        See the menu
      </Link>
    </div>
  )
}
