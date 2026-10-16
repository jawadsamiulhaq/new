import { useQueryClient } from '@tanstack/react-query'
import {
  BarChart3,
  ClipboardList,
  KeyRound,
  ListChecks,
  LoaderCircle,
  LogOut,
  MapPin,
  Settings as SettingsIcon,
  Tag,
  Users,
  UtensilsCrossed,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Toaster } from '../components/Toaster'
import { useToast } from '../components/toastStore'
import { useStore } from '../lib/queries'
import { usePageTitle } from '../lib/usePageTitle'
import { adminApi, type StaffMe } from './adminApi'
import { ringer } from './ringer'
import { useAdminMutation, useLiveOrders, useRinger, useStaffMe } from './hooks'
import { AdminDialog, Field, inputClass, Switch } from './ui'
import { useStaffHub, type HubStatus } from './useStaffHub'

const NAV = [
  { to: '/admin', label: 'Live orders', icon: Zap, end: true, ownerOnly: false },
  { to: '/admin/orders', label: 'Order history', icon: ClipboardList, ownerOnly: false },
  { to: '/admin/menu', label: 'Menu', icon: UtensilsCrossed, ownerOnly: false },
  { to: '/admin/options', label: 'Options & sauces', icon: ListChecks, ownerOnly: false },
  { to: '/admin/areas', label: 'Delivery areas', icon: MapPin, ownerOnly: true },
  { to: '/admin/promos', label: 'Promo codes', icon: Tag, ownerOnly: true },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3, ownerOnly: true },
  { to: '/admin/staff', label: 'Staff', icon: Users, ownerOnly: true },
  { to: '/admin/settings', label: 'Settings & hours', icon: SettingsIcon, ownerOnly: true },
] as const

export function AdminLayout() {
  usePageTitle('Admin')
  const { data: me, isPending } = useStaffMe()
  const location = useLocation()

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <LoaderCircle className="size-8 animate-spin text-muted" />
      </div>
    )
  }
  if (!me) return <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname)}`} replace />
  return <Shell me={me} />
}

function Shell({ me }: { me: StaffMe }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast((s) => s.show)
  const { data: live } = useLiveOrders()
  const [passwordOpen, setPasswordOpen] = useState(false)
  useRinger()

  const hubStatus = useStaffHub((number) => toast(`New order #${number}!`))
  const waiting = live?.filter((o) => o.order.status === 'Placed').length ?? 0

  // Ring until every new order has been accepted or rejected; flash the tab title too.
  useEffect(() => {
    ringer.setRinging(waiting > 0)
    if (waiting === 0) return
    let flip = false
    const timer = window.setInterval(() => {
      flip = !flip
      document.title = flip ? `🔔 ${waiting} NEW ORDER${waiting > 1 ? 'S' : ''}` : 'Admin | BurChips × Bake Dukan'
    }, 1000)
    return () => {
      window.clearInterval(timer)
      document.title = 'Admin | BurChips × Bake Dukan'
    }
  }, [waiting])

  useEffect(() => () => ringer.setRinging(false), [])

  async function signOut() {
    await adminApi.logout().catch(() => undefined)
    queryClient.setQueryData(['admin', 'me'], null)
    queryClient.removeQueries({ queryKey: ['admin'] })
    navigate('/admin/login', { replace: true })
  }

  const nav = NAV.filter((n) => !n.ownerOnly || me.role === 'Owner')

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-charcoal lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:block lg:px-5 lg:py-5">
          <div>
            <p className="font-display text-xl font-extrabold">
              Bur<span className="text-mustard">Chips</span> <span className="text-sm font-semibold text-muted">Admin</span>
            </p>
            <p className="text-xs text-muted">
              {me.displayName} · {me.role}
            </p>
          </div>
          <HubIndicator status={hubStatus} />
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 pb-3 [scrollbar-width:none] lg:flex-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                  isActive ? 'bg-mustard text-on-mustard' : 'text-cream hover:bg-coal'
                }`
              }
            >
              <item.icon className="size-4.5" aria-hidden />
              {item.label}
              {item.to === '/admin' && waiting > 0 && (
                <span className="ml-auto grid min-w-6 place-items-center rounded-full bg-danger px-1.5 text-xs font-bold text-cream">{waiting}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="hidden space-y-1 border-t border-line p-3 lg:block">
          <button type="button" onClick={() => setPasswordOpen(true)} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted hover:bg-coal hover:text-cream">
            <KeyRound className="size-4" /> Change password
          </button>
          <button type="button" onClick={signOut} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted hover:bg-coal hover:text-cream">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        <TopBar onPassword={() => setPasswordOpen(true)} onSignOut={signOut} />
        <main className="px-4 py-6 lg:px-8">
          <Outlet context={me} />
        </main>
      </div>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
      <Toaster position="bottom" />
    </div>
  )
}

function HubIndicator({ status }: { status: HubStatus }) {
  const map = {
    live: { dot: 'bg-success', text: 'Live' },
    connecting: { dot: 'bg-mustard animate-pulse', text: 'Connecting…' },
    offline: { dot: 'bg-danger', text: 'Offline — retrying' },
  }[status]
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted lg:mt-2" role="status">
      <span className={`size-2 rounded-full ${map.dot}`} aria-hidden /> {map.text}
    </span>
  )
}

/** Sound/screen controls and the pause-orders switch, visible on every admin page. */
function TopBar({ onPassword, onSignOut }: { onPassword: () => void; onSignOut: () => void }) {
  const { data: store } = useStore()
  const [pauseOpen, setPauseOpen] = useState(false)
  const [message, setMessage] = useState('')
  useRinger()

  const pause = useAdminMutation((args: { isPaused: boolean; message?: string }) => adminApi.pause(args.isPaused, args.message), {
    invalidate: [['store']],
    onSuccess: () => setPauseOpen(false),
  })

  const paused = store?.status.isPaused ?? false

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-ink/95 px-4 py-3 backdrop-blur lg:sticky lg:top-0 lg:z-20 lg:px-8">
      {ringer.started ? (
        <span className={`flex items-center gap-2 text-sm font-semibold ${ringer.ringing ? 'animate-pulse text-danger' : 'text-success'}`}>
          🔔 {ringer.ringing ? 'Ringing — accept new orders' : 'Shift started · sound on'}
        </span>
      ) : (
        <button type="button" onClick={() => void ringer.start()} className="btn-primary px-4 py-2 text-sm">
          🔔 Start shift (turn on order sound)
        </button>
      )}

      <div className="flex items-center gap-3">
        <span className={`text-sm font-semibold ${paused ? 'text-danger' : 'text-muted'}`}>{paused ? 'Online orders paused' : 'Taking online orders'}</span>
        <Switch
          checked={!paused}
          tone="success"
          label={paused ? 'Resume online orders' : 'Pause online orders'}
          onChange={(on) => (on ? pause.mutate({ isPaused: false }) : setPauseOpen(true))}
          disabled={!store || pause.isPending}
        />
        <button type="button" onClick={onPassword} className="text-muted hover:text-cream lg:hidden" aria-label="Change password">
          <KeyRound className="size-5" />
        </button>
        <button type="button" onClick={onSignOut} className="text-muted hover:text-cream lg:hidden" aria-label="Sign out">
          <LogOut className="size-5" />
        </button>
      </div>

      <AdminDialog
        open={pauseOpen}
        onOpenChange={setPauseOpen}
        title="Pause online orders?"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setPauseOpen(false)}>
              Keep taking orders
            </button>
            <button type="button" className="btn-primary bg-danger hover:bg-danger/80" onClick={() => pause.mutate({ isPaused: true, message })} disabled={pause.isPending}>
              Pause orders
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">Customers can still browse the menu but can’t check out until you switch orders back on.</p>
        <Field label="Message for customers (optional)" htmlFor="pause-message">
          <input id="pause-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} className={inputClass} placeholder="e.g. Kitchen is very busy — back in 20 minutes" />
        </Field>
        <div className="flex flex-wrap gap-2">
          {['Kitchen is very busy — back in 20 minutes.', 'Back shortly — please call us to order.', 'Closed for prayer — back soon.'].map((m) => (
            <button key={m} type="button" onClick={() => setMessage(m)} className="rounded-full border border-line px-3 py-1 text-xs hover:border-mustard">
              {m}
            </button>
          ))}
        </div>
      </AdminDialog>
    </div>
  )
}

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const change = useAdminMutation(() => adminApi.changePassword(current, next), {
    success: 'Password changed',
    onSuccess: () => {
      setCurrent('')
      setNext('')
      onOpenChange(false)
    },
  })

  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Change your password"
      footer={
        <button type="button" className="btn-primary" disabled={!current || next.length < 10 || change.isPending} onClick={() => change.mutate(undefined)}>
          Save password
        </button>
      }
    >
      <Field label="Current password" htmlFor="pw-current">
        <input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
      </Field>
      <Field label="New password" htmlFor="pw-new" hint="At least 10 characters, with upper- and lower-case letters and a number.">
        <input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
      </Field>
    </AdminDialog>
  )
}
