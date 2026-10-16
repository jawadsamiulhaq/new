import { RefreshCw } from 'lucide-react'

export function MenuSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 pt-8" aria-busy="true" aria-label="Loading menu">
      <div className="h-12 w-40 rounded-xl bg-coal" />
      <div className="mt-5 h-12 max-w-md rounded-full bg-coal" />
      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-4 rounded-card border border-line bg-coal p-3">
            <div className="size-24 rounded-xl bg-charcoal" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 w-3/4 rounded bg-charcoal" />
              <div className="h-3 w-1/2 rounded bg-charcoal" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="font-display text-xl font-bold">We couldn’t load the menu</p>
      <p className="text-muted">Please check your connection and try again. You can always call us at 0344-1858989.</p>
      <button type="button" onClick={onRetry} className="btn-primary">
        <RefreshCw className="size-4" /> Try again
      </button>
    </div>
  )
}
