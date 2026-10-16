import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { useEffect } from 'react'
import { useToast } from './toastStore'

const VISIBLE_MS = { success: 2500, error: 5000 }

/** `bottom` keeps pop-ups clear of the admin toolbar and banners. */
export function Toaster({ position = 'top' }: { position?: 'top' | 'bottom' }) {
  const { message, tone, id, dismiss } = useToast()

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(dismiss, VISIBLE_MS[tone])
    return () => clearTimeout(timer)
  }, [message, tone, id, dismiss])

  return (
    <div aria-live={tone === 'error' ? 'assertive' : 'polite'} className={`pointer-events-none fixed inset-x-0 z-[60] flex px-4 ${position === 'top' ? 'top-20 justify-center' : 'bottom-6 justify-center sm:justify-end'}`}>
      {message && (
        <div
          key={id}
          role={tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex max-w-lg items-center gap-2 rounded-full border bg-charcoal px-5 py-3 text-sm font-semibold shadow-xl animate-[fade-in_150ms] ${
            tone === 'error' ? 'border-danger/50' : 'border-line'
          }`}
        >
          {tone === 'error' ? <AlertCircle className="size-5 shrink-0 text-danger" /> : <CheckCircle2 className="size-5 shrink-0 text-success" />}
          {message}
        </div>
      )}
    </div>
  )
}
