import type { DayOfWeek, OpeningHours, Store } from './api'

const SHOP_TIME_ZONE = 'Asia/Karachi'

/** "12:00 PM" for an ISO moment, shown in the shop's time zone. */
export function formatTime(iso: string, timeZone = SHOP_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-PK', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone })
    .format(new Date(iso))
    .toUpperCase()
}

/** "12:00 PM" for an "HH:mm" clock time. */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h < 12 ? 'AM' : 'PM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

export function formatHours(h: OpeningHours): string {
  if (h.isClosed) return 'Closed'
  if (h.opensAt === h.closesAt) return 'Open 24 hours'
  return `${formatClock(h.opensAt)} – ${formatClock(h.closesAt)}`
}

/** Today's weekday in the shop's time zone, e.g. "Thursday". */
export function shopWeekday(timeZone = SHOP_TIME_ZONE): DayOfWeek {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(new Date()) as DayOfWeek
}

/** Day label for the next opening relative to now: "today", "tomorrow" or a weekday. */
function dayLabel(iso: string, timeZone = SHOP_TIME_ZONE): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const target = fmt.format(new Date(iso))
  const today = fmt.format(new Date())
  const tomorrow = fmt.format(new Date(Date.now() + 86_400_000))
  if (target === today) return 'today'
  if (target === tomorrow) return 'tomorrow'
  return new Intl.DateTimeFormat('en-PK', { weekday: 'long', timeZone }).format(new Date(iso))
}

export interface StatusText {
  tone: 'open' | 'closed' | 'paused'
  /** Short label, e.g. "Open now". */
  label: string
  /** Detail, e.g. "until 2:00 AM" or "Opens today at 12:00 PM". */
  detail: string
}

export function storeStatusText(store: Store): StatusText {
  const { status, timeZone } = store
  if (status.isOpen && status.isPaused) {
    return {
      tone: 'paused',
      label: 'Online orders paused',
      detail: status.pauseMessage ?? 'We’re very busy right now — please try again shortly or call us.',
    }
  }
  if (status.isOpen) {
    return {
      tone: 'open',
      label: 'Open now',
      detail: status.closesAt ? `until ${formatTime(status.closesAt, timeZone)}` : '',
    }
  }
  return {
    tone: 'closed',
    label: 'Closed',
    detail: status.nextOpenAt
      ? `Opens ${dayLabel(status.nextOpenAt, timeZone)} at ${formatTime(status.nextOpenAt, timeZone)}`
      : 'Not taking orders right now',
  }
}

/** International number for wa.me / tel links, e.g. "923441858989". */
export function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '')
}
