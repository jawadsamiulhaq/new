import { MapPin, MessageCircle, Phone } from 'lucide-react'
import { digitsOnly, formatHours } from '../lib/hours'
import { useStore } from '../lib/queries'
import { usePageTitle } from '../lib/usePageTitle'

export function AboutPage() {
  usePageTitle('Find us')
  const { data: store } = useStore()
  if (!store) return null

  const mapQuery = encodeURIComponent(store.address)

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8">
      <h1 className="text-4xl font-extrabold sm:text-5xl">Find us</h1>
      <p className="mt-2 max-w-2xl text-muted">
        BurChips serves burgers, grilled chicken and wraps; <span className="text-dukan">Bake Dukan</span> bakes the desserts — good
        food and sweet treats under one roof in DHA Phase 8.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <section className="space-y-3 rounded-3xl border border-line bg-coal p-6">
            <h2 className="font-display text-xl font-bold text-mustard">Address</h2>
            <p className="flex gap-2">
              <MapPin className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
              {store.address}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <a href={`tel:${digitsOnly(store.phone)}`} className="btn-primary">
                <Phone className="size-4" /> Call {store.phone}
              </a>
              {store.whatsAppNumber && (
                <a href={`https://wa.me/${digitsOnly(store.whatsAppNumber)}`} target="_blank" rel="noreferrer" className="btn-ghost">
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-line bg-coal p-6">
            <h2 className="font-display text-xl font-bold text-mustard">Opening hours</h2>
            <dl className="mt-3 divide-y divide-line">
              {store.hours.map((h) => (
                <div key={h.day} className="flex justify-between py-2">
                  <dt className="text-muted">{h.day}</dt>
                  <dd className="font-semibold">{formatHours(h)}</dd>
                </div>
              ))}
            </dl>
          </section>

          {store.deliveryEnabled && store.deliveryAreas.length > 0 && (
            <section className="rounded-3xl border border-line bg-coal p-6">
              <h2 className="font-display text-xl font-bold text-mustard">We deliver to</h2>
              <p className="mt-3 text-muted">{store.deliveryAreas.map((a) => a.name).join(' · ')}</p>
              <p className="mt-2 text-sm text-muted">Delivery fees and minimum order are shown at checkout.</p>
            </section>
          )}
        </div>

        <div className="min-h-80 overflow-hidden rounded-3xl border border-line">
          <iframe
            title="Map showing BurChips × Bake Dukan"
            src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
            className="size-full min-h-80 grayscale-[0.3] invert-[0.92] hue-rotate-180"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </div>
  )
}
