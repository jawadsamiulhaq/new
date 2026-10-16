import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { formatPrice } from '../lib/format'
import { useStore } from '../lib/queries'
import { usePageTitle } from '../lib/usePageTitle'
import type { Store } from '../lib/api'

const LAST_UPDATED = '16 October 2026'

function LegalLayout({ title, intro, children }: { title: string; intro: string; children: (store: Store | undefined) => ReactNode }) {
  usePageTitle(title)
  const { data: store } = useStore()
  return (
    <article className="mx-auto max-w-3xl px-4 pt-8">
      <h1 className="text-4xl font-extrabold">{title}</h1>
      <p className="mt-2 text-sm text-muted">Last updated: {LAST_UPDATED}</p>
      <p className="mt-6 text-lg">{intro}</p>
      <div className="legal mt-8 space-y-8">{children(store)}</div>
      <nav aria-label="Policies" className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-6 text-sm">
        <Link to="/privacy" className="text-mustard hover:underline">Privacy</Link>
        <Link to="/terms" className="text-mustard hover:underline">Terms</Link>
        <Link to="/refunds" className="text-mustard hover:underline">Refunds &amp; cancellations</Link>
        <Link to="/delivery" className="text-mustard hover:underline">Delivery</Link>
      </nav>
    </article>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      <div className="space-y-3 leading-relaxed text-cream/90 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">{children}</div>
    </section>
  )
}

function Contact({ store }: { store: Store | undefined }) {
  return (
    <p>
      {store?.name ?? 'BurChips × Bake Dukan'}, {store?.address ?? '185/1 D Block, DHA Phase 8, Commercial Broadway, Lahore'}. Phone{' '}
      <a href={`tel:${(store?.phone ?? '0344-1858989').replace(/\D/g, '')}`} className="text-mustard hover:underline">
        {store?.phone ?? '0344-1858989'}
      </a>
      .
    </p>
  )
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" intro="This explains what information we collect when you order from us, why, and what you can ask us to do with it. We only collect what we need to make and deliver your food.">
      {(store) => (
        <>
          <Section title="Who we are">
            <Contact store={store} />
          </Section>
          <Section title="What we collect">
            <ul>
              <li><strong>Mobile number</strong> — to verify it’s really you (we text a one-time code) and to contact you about your order. Your verified number is your account; there is no password.</li>
              <li><strong>Name, delivery address and landmark</strong> — so the kitchen and rider know who the order is for and where to bring it. If you tick “Save this address”, we keep it for next time.</li>
              <li><strong>Your orders</strong> — items, choices, notes, totals, payment method and status, so you can track orders and reorder.</li>
              <li><strong>Technical information</strong> — your IP address and basic request logs, used to keep the site secure (for example, limiting repeated code requests) and to fix errors.</li>
            </ul>
          </Section>
          <Section title="Cookies and browser storage">
            <p>We only use cookies that the site needs to work: one to keep you signed in, and one to protect our staff pages from forged requests. Your cart is saved in your own browser so it isn’t lost if you close the page. We don’t use advertising or tracking cookies.</p>
          </Section>
          <Section title="How we use your information">
            <ul>
              <li>To accept, prepare, deliver and charge for your orders.</li>
              <li>To contact you about an order (for example, if an item is sold out or the rider can’t find you).</li>
              <li>To prevent fake orders and misuse of the site.</li>
              <li>To understand what sells and improve our service (using order totals and items, not your personal details).</li>
            </ul>
            <p>We don’t send marketing messages unless you have asked to receive them.</p>
          </Section>
          <Section title="Who we share it with">
            <ul>
              <li><strong>Our staff and riders</strong> see your name, phone number, address and order so they can make and deliver it.</li>
              <li><strong>Service providers</strong> who run parts of the site for us: Microsoft Azure (hosting and storage), our SMS provider (to send your login code), and Meta WhatsApp (to alert our team about new orders). When online payment is offered, the payment provider (PayFast) processes your payment — we never see or store your card details.</li>
            </ul>
            <p>We never sell your information. We may share it if the law requires us to.</p>
          </Section>
          <Section title="How long we keep it">
            <p>Login codes expire after 5 minutes. We keep your account, saved addresses and order history while you use our service, and order records for as long as we need them for accounting and legal reasons.</p>
          </Section>
          <Section title="Your choices">
            <p>You can sign out at any time from “My orders”. To get a copy of your information, correct it, or delete your account and saved addresses, call or WhatsApp us from the number you order with.</p>
          </Section>
          <Section title="Security">
            <p>The site uses encrypted connections (HTTPS). Login codes are stored scrambled, never in plain text. Only our staff can see orders, and only the owner can change prices and settings.</p>
          </Section>
          <Section title="Changes and contact">
            <p>If we change this policy we’ll update the date at the top. Questions? Contact us:</p>
            <Contact store={store} />
          </Section>
        </>
      )}
    </LegalLayout>
  )
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms & Conditions" intro="These terms apply when you order from BurChips × Bake Dukan through this website. By placing an order you agree to them.">
      {(store) => (
        <>
          <Section title="Placing an order">
            <ul>
              <li>You need to verify your mobile number to order. Please give a correct name, number and address.</li>
              <li>Your order is confirmed when our kitchen accepts it — you’ll see “Confirmed” on your order page. We may decline an order (for example, if an item has sold out or the address is outside our delivery areas) and will show you the reason.</li>
              <li>Online ordering is available during our opening hours, unless we temporarily pause it at very busy times.</li>
            </ul>
          </Section>
          <Section title="Prices and payment">
            <ul>
              <li>Prices are in Pakistani Rupees and include tax unless shown otherwise at checkout. Delivery fees depend on your area and are shown before you order.</li>
              <li>The total shown at checkout is the amount you pay. If a price changes while food is in your cart, checkout shows the new price before you order.</li>
              <li>For cash orders, please have the amount ready for the rider or at pick-up.</li>
              <li>Promo codes have their own conditions (such as a minimum order, end date or one use per customer), can’t be exchanged for cash, and can’t be combined.</li>
            </ul>
          </Section>
          <Section title="Food and allergies">
            <p>Our kitchen handles wheat, dairy, eggs, nuts, sesame and other allergens. If you have an allergy, please call us before ordering — we can’t guarantee any item is allergen-free. Photos are for illustration; your food may look slightly different.</p>
          </Section>
          <Section title="Delivery and pick-up">
            <p>Delivery and pick-up times are estimates. See our <Link to="/delivery" className="text-mustard hover:underline">Delivery Policy</Link> for areas, fees and what happens if we can’t reach you.</p>
          </Section>
          <Section title="Cancellations, refunds and complaints">
            <p>See our <Link to="/refunds" className="text-mustard hover:underline">Refunds &amp; Cancellations</Link> policy.</p>
          </Section>
          <Section title="Fair use">
            <p>Fake or prank orders waste food and riders’ time. We may refuse orders from, or block, numbers that repeatedly don’t accept or pay for orders.</p>
          </Section>
          <Section title="Our responsibility">
            <p>We take care to prepare and deliver your order correctly and safely. Our responsibility for a problem with an order is limited to replacing it or refunding what you paid for it, except where the law says otherwise.</p>
          </Section>
          <Section title="Law and contact">
            <p>These terms are governed by the laws of Pakistan, and the courts of Lahore have jurisdiction. Questions? Contact us:</p>
            <Contact store={store} />
          </Section>
        </>
      )}
    </LegalLayout>
  )
}

export function RefundsPage() {
  return (
    <LegalLayout title="Refunds & Cancellations" intro="We want every order to be right. Here’s what to do if you need to cancel or something isn’t right.">
      {(store) => (
        <>
          <Section title="Cancelling an order">
            <ul>
              <li>Call us as soon as possible. We can cancel your order free of charge if the kitchen hasn’t started preparing it.</li>
              <li>Once your food is being prepared or is on the way, we usually can’t cancel it, because it’s made fresh for you.</li>
              <li>If we have to cancel or decline your order, you won’t be charged, and any online payment is refunded in full.</li>
            </ul>
          </Section>
          <Section title="Wrong, missing or damaged items">
            <p>Contact us within <strong>1 hour</strong> of receiving your order, with your order number and a photo if possible. Depending on what happened, we will:</p>
            <ul>
              <li>send the missing or correct item, or</li>
              <li>give you credit on your next order, or</li>
              <li>refund the affected item.</li>
            </ul>
          </Section>
          <Section title="How refunds are paid">
            <ul>
              <li><strong>Cash orders:</strong> refunded in cash, or by JazzCash/EasyPaisa/bank transfer to your number.</li>
              <li><strong>Online payments:</strong> refunded to the same card or wallet. Banks and wallets usually take 7–10 working days to show the money.</li>
            </ul>
          </Section>
          <Section title="Contact">
            <Contact store={store} />
          </Section>
        </>
      )}
    </LegalLayout>
  )
}

export function DeliveryPolicyPage() {
  return (
    <LegalLayout title="Delivery Policy" intro="We deliver with our own riders in and around DHA, Lahore. Pick-up from the shop is always welcome.">
      {(store) => (
        <>
          <Section title="Where we deliver">
            {store && store.deliveryAreas.length > 0 ? (
              <>
                <p>Choose your area at checkout. Current areas, delivery fees and minimum orders:</p>
                <ul>
                  {store.deliveryAreas.map((a) => (
                    <li key={a.id}>
                      {a.name} — {a.fee === 0 ? 'free delivery' : `${formatPrice(a.fee)} delivery`}
                      {a.minOrder > 0 ? `, minimum order ${formatPrice(a.minOrder)}` : ''}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>Choose your area at checkout to see the delivery fee and minimum order.</p>
            )}
            {store?.freeDeliveryThreshold && <p>Delivery is free on orders of {formatPrice(store.freeDeliveryThreshold)} or more.</p>}
            <p>Outside these areas? Call us — or choose pick-up.</p>
          </Section>
          <Section title="Delivery times">
            <p>
              Most orders arrive in about {store?.estimatedDeliveryMinutes ?? 45} minutes; pick-up orders are usually ready in about{' '}
              {store?.estimatedPickupMinutes ?? 20} minutes. These are estimates — busy times, weather and traffic can add delays. You can follow your order live on its order page.
            </p>
          </Section>
          <Section title="Receiving your order">
            <ul>
              <li>Please keep your phone on — the rider may call when nearby.</li>
              <li>For cash orders, please have the amount ready.</li>
              <li>If the rider can’t reach you, they’ll wait about 10 minutes and call you. If we still can’t reach you, the order may be returned to the shop, and future cash orders from that number may be restricted.</li>
            </ul>
          </Section>
          <Section title="Contact">
            <Contact store={store} />
          </Section>
        </>
      )}
    </LegalLayout>
  )
}
