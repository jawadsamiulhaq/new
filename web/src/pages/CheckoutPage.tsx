import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bike, Check, LoaderCircle, LogOut, ShoppingBag, Store as StoreIcon, Tag, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { PhoneSignIn } from '../features/account/PhoneSignIn'
import { toRequestLines } from '../features/cart/cartRequest'
import { useCart } from '../features/cart/cartStore'
import { api, ApiError, type OrderType, type QuoteRequest } from '../lib/api'
import { formatPrice } from '../lib/format'
import { storeStatusText } from '../lib/hours'
import { useMe, useStore } from '../lib/queries'
import { usePageTitle } from '../lib/usePageTitle'

const inputClass =
  'w-full rounded-xl border border-line bg-coal px-4 py-3 text-cream placeholder:text-muted/70 focus:border-mustard focus:outline-none'

export function CheckoutPage() {
  usePageTitle('Checkout')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { lines, clear, open: openCart } = useCart()
  const { data: store } = useStore()
  const { data: me, isPending: meLoading } = useMe()

  const [type, setType] = useState<OrderType | null>(null)
  const [addressChoice, setAddressChoice] = useState<number | 'new' | null>(null)
  const [areaId, setAreaId] = useState<number | null>(null)
  const [addressLine, setAddressLine] = useState('')
  const [landmark, setLandmark] = useState('')
  const [saveAddress, setSaveAddress] = useState(true)
  const [name, setName] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [promoInput, setPromoInput] = useState('')
  const [promoCode, setPromoCode] = useState<string | null>(null)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [showErrors, setShowErrors] = useState(false)

  // Defaults that depend on loaded data (store settings, saved addresses, name).
  const orderType: OrderType = type ?? (store && !store.deliveryEnabled ? 'Pickup' : 'Delivery')
  const savedAddresses = me?.addresses ?? []
  const choice = addressChoice ?? (savedAddresses[0]?.id ?? 'new')
  const saved = typeof choice === 'number' ? savedAddresses.find((a) => a.id === choice) : undefined
  const effectiveAreaId = saved ? saved.deliveryAreaId : areaId
  const effectiveAddress = saved ? saved.addressLine : addressLine
  const effectiveLandmark = saved ? (saved.landmark ?? '') : landmark
  const customerName = name ?? me?.name ?? ''

  const quoteRequest: QuoteRequest = {
    type: orderType,
    deliveryAreaId: orderType === 'Delivery' ? effectiveAreaId : null,
    promoCode,
    lines: toRequestLines(lines),
  }
  const quote = useQuery({
    queryKey: ['quote', quoteRequest, me?.phone ?? null],
    queryFn: () => api.quote(quoteRequest),
    enabled: lines.length > 0,
    placeholderData: keepPreviousData,
  })

  const place = useMutation({
    mutationFn: () =>
      api.placeOrder({
        ...quoteRequest,
        clientRequestId: requestId,
        addressLine: orderType === 'Delivery' ? effectiveAddress.trim() : null,
        landmark: orderType === 'Delivery' ? effectiveLandmark.trim() || null : null,
        saveAddress: orderType === 'Delivery' && !saved && saveAddress,
        customerName: customerName.trim(),
        notes: notes.trim() || null,
        paymentMethod: 'Cod',
      }),
    onSuccess: (order) => {
      queryClient.setQueryData(['order', order.publicId], order)
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['me'] })
      clear()
      setRequestId(crypto.randomUUID())
      navigate(`/order/${order.publicId}`, { replace: true })
    },
    onError: (error) => {
      // A failed attempt may have changed things (e.g. promo used up) — refresh totals.
      if (error instanceof ApiError && error.status === 422) void quote.refetch()
    },
  })

  if (lines.length === 0 && !place.isSuccess) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <ShoppingBag className="size-14 text-line" strokeWidth={1.5} />
        <h1 className="text-2xl font-extrabold">Your cart is empty</h1>
        <Link to="/menu" className="btn-primary">
          Browse the menu
        </Link>
      </div>
    )
  }

  // ---- Validation (server re-checks everything) ----
  const signedIn = Boolean(me)
  const nameError = customerName.trim().length < 2 ? 'Please enter your name.' : null
  const areaError = orderType === 'Delivery' && !effectiveAreaId ? 'Please choose your area.' : null
  const addressError = orderType === 'Delivery' && effectiveAddress.trim().length < 5 ? 'Please enter your full address (house, street, block).' : null
  const formValid = signedIn && !nameError && !areaError && !addressError
  const q = quote.data
  const blocking = q?.problems ?? []
  const promoProblem = promoCode && q?.promoMessage ? q.promoMessage : null
  const canOrder = store?.status.canOrder ?? false
  const ready = formValid && canOrder && !!q && blocking.length === 0 && !promoProblem && !quote.isFetching

  function submit() {
    setShowErrors(true)
    if (ready) place.mutate()
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8">
      <h1 className="text-4xl font-extrabold">Checkout</h1>

      {store && !canOrder && (
        <p role="status" className="mt-4 rounded-2xl border border-mustard/30 bg-mustard/10 px-4 py-3 text-sm">
          <span className="font-bold text-mustard">{storeStatusText(store).label}.</span> {storeStatusText(store).detail}
        </p>
      )}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* 1. Contact */}
          <Section step={1} title="Your details" done={signedIn && !nameError}>
            {meLoading ? (
              <LoaderCircle className="size-5 animate-spin text-muted" />
            ) : signedIn ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-coal px-4 py-3">
                  <span>
                    <span className="text-muted">Signed in as</span> <span className="font-semibold">{me!.phone}</span>
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await api.logout()
                      queryClient.setQueryData(['me'], null)
                    }}
                    className="flex items-center gap-1 text-sm text-muted hover:text-cream"
                  >
                    <LogOut className="size-4" /> Not you?
                  </button>
                </div>
                <Field label="Your name" error={showErrors ? nameError : null} htmlFor="name">
                  <input id="name" autoComplete="name" value={customerName} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputClass} placeholder="e.g. Ayesha Khan" />
                </Field>
              </div>
            ) : (
              <PhoneSignIn />
            )}
          </Section>

          {/* 2. Delivery or pick-up */}
          <Section step={2} title="Delivery or pick-up" done={orderType === 'Pickup' || (!areaError && !addressError)}>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Order type">
              <TypeOption icon={<Bike className="size-5" />} label="Delivery" detail={store ? `~${store.estimatedDeliveryMinutes} min` : ''} selected={orderType === 'Delivery'} disabled={store ? !store.deliveryEnabled : false} onSelect={() => setType('Delivery')} />
              <TypeOption icon={<StoreIcon className="size-5" />} label="Pick-up" detail={store ? `~${store.estimatedPickupMinutes} min` : ''} selected={orderType === 'Pickup'} disabled={store ? !store.pickupEnabled : false} onSelect={() => setType('Pickup')} />
            </div>

            {orderType === 'Delivery' ? (
              <div className="mt-5 space-y-4">
                {savedAddresses.length > 0 && (
                  <div className="space-y-2" role="radiogroup" aria-label="Saved addresses">
                    {savedAddresses.map((a) => (
                      <ChoiceRow key={a.id} selected={choice === a.id} onSelect={() => setAddressChoice(a.id)}>
                        <span className="font-semibold">{a.deliveryAreaName}</span>
                        <span className="block text-sm text-muted">{a.addressLine}</span>
                      </ChoiceRow>
                    ))}
                    <ChoiceRow selected={choice === 'new'} onSelect={() => setAddressChoice('new')}>
                      <span className="font-semibold">Use a new address</span>
                    </ChoiceRow>
                  </div>
                )}

                {choice === 'new' && (
                  <>
                    <Field label="Area" error={showErrors ? areaError : null} htmlFor="area">
                      <select id="area" value={areaId ?? ''} onChange={(e) => setAreaId(e.target.value ? Number(e.target.value) : null)} className={inputClass}>
                        <option value="">Choose your area…</option>
                        {store?.deliveryAreas.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} — delivery {formatPrice(a.fee)}
                            {a.minOrder > 0 ? `, min ${formatPrice(a.minOrder)}` : ''}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Address" error={showErrors ? addressError : null} htmlFor="address">
                      <textarea id="address" autoComplete="street-address" rows={2} maxLength={300} value={addressLine} onChange={(e) => setAddressLine(e.target.value)} className={`${inputClass} resize-none`} placeholder="House #, street, block / sector" />
                    </Field>
                    <Field label="Nearest landmark (optional)" htmlFor="landmark">
                      <input id="landmark" maxLength={120} value={landmark} onChange={(e) => setLandmark(e.target.value)} className={inputClass} placeholder="e.g. near Masjid, opposite park" />
                    </Field>
                    {signedIn && (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="size-4 accent-mustard" />
                        Save this address for next time
                      </label>
                    )}
                  </>
                )}
              </div>
            ) : (
              store && (
                <p className="mt-4 rounded-xl bg-coal px-4 py-3 text-sm">
                  Pick up from <span className="font-semibold">{store.address}</span>
                </p>
              )
            )}
          </Section>

          {/* 3. Notes + payment */}
          <Section step={3} title="Notes & payment" done>
            <Field label="Note for the kitchen or rider (optional)" htmlFor="notes">
              <textarea id="notes" rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} resize-none`} placeholder="e.g. please call on arrival" />
            </Field>
            <div className="mt-4">
              <p className="text-sm font-semibold">Payment</p>
              <ChoiceRow selected onSelect={() => {}}>
                <span className="font-semibold">{orderType === 'Delivery' ? 'Cash on delivery' : 'Pay at pick-up'}</span>
                <span className="block text-sm text-muted">Pay with cash when you get your food.</span>
              </ChoiceRow>
            </div>
          </Section>
        </div>

        {/* Summary */}
        <aside className="space-y-4 rounded-3xl border border-line bg-charcoal p-5 lg:sticky lg:top-20" aria-label="Order summary">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-extrabold">Your order</h2>
            <button type="button" onClick={openCart} className="text-sm text-mustard hover:underline">
              Edit
            </button>
          </div>

          <ul className="divide-y divide-line">
            {(q?.lines ?? []).map((line, i) => (
              <li key={i} className="flex justify-between gap-3 py-2.5 text-sm">
                <span>
                  <span className="font-semibold">
                    {line.quantity}× {line.name}
                  </span>
                  {line.options.length > 0 && <span className="block text-muted">{line.options.map((o) => o.name).join(' · ')}</span>}
                </span>
                <span className="shrink-0 font-semibold">{formatPrice(line.lineTotal)}</span>
              </li>
            ))}
          </ul>

          {/* Promo */}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setPromoCode(promoInput.trim() || null)
            }}
          >
            <div className="relative flex-1">
              <Tag className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input aria-label="Promo code" value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} placeholder="Promo code" maxLength={40} className={`${inputClass} py-2.5 pl-9 uppercase`} />
            </div>
            <button type="submit" className="btn-ghost px-4" disabled={!promoInput.trim()}>
              Apply
            </button>
          </form>
          {promoCode && (
            <div className={`flex items-start justify-between gap-2 text-sm ${promoProblem ? 'text-danger' : 'text-success'}`}>
              <span>{promoProblem ?? `${q?.promoCode ?? promoCode} applied`}</span>
              <button
                type="button"
                aria-label="Remove promo code"
                onClick={() => {
                  setPromoCode(null)
                  setPromoInput('')
                }}
                className="text-muted hover:text-cream"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {q && (
            <dl className="space-y-1.5 border-t border-line pt-3 text-sm">
              <Row label="Subtotal" value={formatPrice(q.subtotal)} />
              {q.discount > 0 && <Row label={`Discount (${q.promoCode})`} value={`−${formatPrice(q.discount)}`} highlight />}
              {orderType === 'Delivery' && <Row label="Delivery" value={effectiveAreaId ? (q.deliveryFee === 0 ? 'Free' : formatPrice(q.deliveryFee)) : '—'} />}
              {q.tax > 0 && <Row label="Tax" value={formatPrice(q.tax)} />}
              <div className="flex items-baseline justify-between border-t border-line pt-3">
                <dt className="font-display text-lg font-bold">Total</dt>
                <dd className="font-display text-2xl font-extrabold text-mustard">{formatPrice(q.total)}</dd>
              </div>
            </dl>
          )}

          {blocking.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {blocking.map((p, i) => (
                <li key={i}>{p.message}</li>
              ))}
            </ul>
          )}
          {place.error && (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              {place.error.message}
            </p>
          )}

          <button type="button" onClick={submit} disabled={place.isPending || !canOrder || quote.isFetching} className="btn-primary w-full text-lg">
            {place.isPending ? 'Placing order…' : q ? `Place order · ${formatPrice(q.total)}` : 'Place order'}
          </button>
          <p className="text-center text-xs text-muted">
            By placing your order you agree to our{' '}
            <Link to="/terms" className="underline hover:text-cream">terms</Link> and{' '}
            <Link to="/refunds" className="underline hover:text-cream">refund policy</Link>.
          </p>
          {!signedIn && <p className="text-center text-xs text-muted">Verify your mobile number above to place the order.</p>}
          {showErrors && signedIn && !formValid && <p className="text-center text-xs text-danger">Please complete the highlighted details.</p>}
        </aside>
      </div>
    </div>
  )
}

function Section({ step, title, done, children }: { step: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-charcoal p-5 sm:p-6" aria-labelledby={`step-${step}`}>
      <h2 id={`step-${step}`} className="mb-4 flex items-center gap-3 font-display text-xl font-bold">
        <span className={`grid size-8 place-items-center rounded-full text-sm font-extrabold ${done ? 'bg-mustard text-on-mustard' : 'border border-line text-muted'}`}>
          {done ? <Check className="size-4" strokeWidth={3} /> : step}
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string | null; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold">
        {label}
      </label>
      {children}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}

function TypeOption(props: { icon: ReactNode; label: string; detail: string; selected: boolean; disabled: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.selected}
      disabled={props.disabled}
      onClick={props.onSelect}
      className={`flex flex-col items-start gap-1 rounded-2xl border-2 p-4 text-left transition-colors disabled:opacity-40 ${
        props.selected ? 'border-mustard bg-mustard/10' : 'border-line bg-coal hover:border-mustard/50'
      }`}
    >
      <span className={props.selected ? 'text-mustard' : 'text-muted'}>{props.icon}</span>
      <span className="font-display font-bold">{props.label}</span>
      <span className="text-xs text-muted">{props.disabled ? 'Unavailable' : props.detail}</span>
    </button>
  )
}

function ChoiceRow({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`mt-2 flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
        selected ? 'border-mustard bg-mustard/5' : 'border-line bg-coal hover:border-mustard/50'
      }`}
    >
      <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 ${selected ? 'border-mustard' : 'border-line'}`}>
        {selected && <span className="size-2.5 rounded-full bg-mustard" />}
      </span>
      <span className="min-w-0">{children}</span>
    </button>
  )
}

function Row({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex justify-between ${highlight ? 'text-success' : ''}`}>
      <dt className={highlight ? '' : 'text-muted'}>{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  )
}
