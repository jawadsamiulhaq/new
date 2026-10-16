import { RefreshCw } from 'lucide-react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

/** Shown when a page fails to load — most often an old tab after we publish a new version. */
export function RouteError() {
  const error = useRouteError()
  const message = error instanceof Error ? error.message : ''
  const isStaleBundle = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(message)
  const notFound = isRouteErrorResponse(error) && error.status === 404

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-display text-3xl font-extrabold">
        Bur<span className="text-mustard">Chips</span>
      </p>
      <h1 className="text-2xl font-extrabold">
        {notFound ? 'Page not found' : isStaleBundle ? 'We’ve just updated the site' : 'Something went wrong'}
      </h1>
      <p className="max-w-md text-muted">
        {isStaleBundle ? 'Please reload to get the latest version. Your cart is saved.' : 'Please reload the page. If it keeps happening, call us at 0344-1858989.'}
      </p>
      <div className="flex gap-3">
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
          <RefreshCw className="size-4" /> Reload
        </button>
        <Link to="/" className="btn-ghost" reloadDocument>
          Home
        </Link>
      </div>
    </div>
  )
}
