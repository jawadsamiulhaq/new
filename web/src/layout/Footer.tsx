import { MapPin, MessageCircle, Phone } from 'lucide-react'
import { Link } from 'react-router'
import { digitsOnly, formatHours } from '../lib/hours'
import { useStore } from '../lib/queries'
import { Logo } from './Header'

const YEAR = new Date().getFullYear()

export function Footer() {
  const { data: store } = useStore()

  return (
    <footer className="mt-20 border-t border-line bg-charcoal">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted">Good food + sweet treats, under one roof. Delivery &amp; take-away in DHA, Lahore.</p>
        </div>

        {store && (
          <div className="space-y-3 text-sm">
            <h2 className="font-display text-base font-bold text-mustard">Visit or call</h2>
            <p className="flex gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              {store.address}
            </p>
            <a href={`tel:${digitsOnly(store.phone)}`} className="flex gap-2 hover:text-mustard">
              <Phone className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              {store.phone}
            </a>
            {store.whatsAppNumber && (
              <a
                href={`https://wa.me/${digitsOnly(store.whatsAppNumber)}`}
                target="_blank"
                rel="noreferrer"
                className="flex gap-2 hover:text-mustard"
              >
                <MessageCircle className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                WhatsApp us
              </a>
            )}
          </div>
        )}

        {store && (
          <div className="space-y-3 text-sm">
            <h2 className="font-display text-base font-bold text-mustard">Opening hours</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {store.hours.map((h) => (
                <div key={h.day} className="contents">
                  <dt className="text-muted">{h.day}</dt>
                  <dd>{formatHours(h)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted">
          <span>© {YEAR} BurChips × Bake Dukan</span>
          <nav aria-label="Policies" className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/about" className="hover:text-mustard">Find us</Link>
            <Link to="/privacy" className="hover:text-mustard">Privacy</Link>
            <Link to="/terms" className="hover:text-mustard">Terms</Link>
            <Link to="/refunds" className="hover:text-mustard">Refunds</Link>
            <Link to="/delivery" className="hover:text-mustard">Delivery</Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
