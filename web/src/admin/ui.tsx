import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

/** Input styling without a width — use with an explicit width class. */
export const inputBase =
  'rounded-xl border border-line bg-coal px-3 py-2.5 text-cream placeholder:text-muted/70 focus:border-mustard focus:outline-none disabled:opacity-50'

export const inputClass = `${inputBase} w-full`

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-extrabold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

/** Accessible on/off switch. */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  tone = 'mustard',
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  tone?: 'mustard' | 'success'
}) {
  const on = tone === 'success' ? 'bg-success' : 'bg-mustard'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? on : 'bg-line'}`}
    >
      <span className={`absolute top-1 size-5 rounded-full bg-cream shadow transition-[left] ${checked ? 'left-6' : 'left-1'}`} />
    </button>
  )
}

export function AdminDialog({
  open,
  onOpenChange,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className={`fixed top-1/2 left-1/2 z-50 flex max-h-[92dvh] w-[calc(100%-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-line bg-ink shadow-2xl outline-none ${
            wide ? 'max-w-3xl' : 'max-w-lg'
          }`}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <Dialog.Title className="font-display text-xl font-extrabold">{title}</Dialog.Title>
            <Dialog.Close className="grid size-9 place-items-center rounded-full hover:bg-coal" aria-label="Close">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="space-y-4 overflow-y-auto p-5">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line bg-charcoal px-5 py-4">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'mustard' | 'danger' | 'success' | 'dukan' }) {
  const tones = {
    muted: 'bg-coal text-muted',
    mustard: 'bg-mustard/15 text-mustard',
    danger: 'bg-danger/15 text-danger',
    success: 'bg-success/15 text-success',
    dukan: 'bg-dukan/15 text-dukan',
  }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

export function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-9 place-items-center rounded-full text-muted hover:bg-coal hover:text-cream disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

/** Rs amount input that keeps whole rupees. */
export function MoneyInput({ id, value, onChange, placeholder }: { id: string; value: number | null; onChange: (value: number | null) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">Rs</span>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))))}
        className={`${inputClass} pl-10`}
      />
    </div>
  )
}
