// Types mirror the .NET DTOs in api/BurChips.Api/Features/*.

export type Brand = 'BurChips' | 'BakeDukan'

export interface MenuOption {
  id: number
  name: string
  price: number
  isAvailable: boolean
}

/** An option group as attached to one item; `id` is the attachment id. */
export interface MenuOptionGroup {
  id: number
  title: string
  minSelect: number
  maxSelect: number
  freeSelections: number
  dependsOnOptionId: number | null
  options: MenuOption[]
}

export interface MenuItem {
  id: number
  name: string
  slug: string
  description: string | null
  price: number
  imageUrl: string | null
  isAvailable: boolean
  isFeatured: boolean
  leadTimeHours: number
  optionGroups: MenuOptionGroup[]
}

export interface MenuCategory {
  id: number
  name: string
  slug: string
  description: string | null
  brand: Brand
  items: MenuItem[]
}

export interface Menu {
  categories: MenuCategory[]
}

export type DayOfWeek =
  | 'Sunday'
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'

export interface StoreStatus {
  isOpen: boolean
  isPaused: boolean
  canOrder: boolean
  pauseMessage: string | null
  closesAt: string | null
  nextOpenAt: string | null
}

export interface OpeningHours {
  day: DayOfWeek
  opensAt: string
  closesAt: string
  isClosed: boolean
}

export interface DeliveryArea {
  id: number
  name: string
  fee: number
  minOrder: number
}

export interface Store {
  name: string
  phone: string
  whatsAppNumber: string | null
  address: string
  timeZone: string
  deliveryEnabled: boolean
  pickupEnabled: boolean
  freeDeliveryThreshold: number | null
  estimatedDeliveryMinutes: number
  estimatedPickupMinutes: number
  status: StoreStatus
  hours: OpeningHours[]
  deliveryAreas: DeliveryArea[]
}

// ---- Customers ----

export interface Address {
  id: number
  label: string | null
  deliveryAreaId: number
  deliveryAreaName: string
  addressLine: string
  landmark: string | null
}

export interface Customer {
  phone: string
  name: string | null
  addresses: Address[]
}

export interface SendCodeResponse {
  phone: string
  expiresInSeconds: number
  /** Only returned by a development server (no real SMS is sent there). */
  devCode: string | null
}

// ---- Checkout & orders ----

export type OrderType = 'Delivery' | 'Pickup'
export type PaymentMethod = 'Cod' | 'PayFast'
export type PaymentStatus = 'Unpaid' | 'Pending' | 'Paid' | 'Failed' | 'Refunded'
export type OrderStatus =
  | 'PendingPayment'
  | 'Placed'
  | 'Accepted'
  | 'Preparing'
  | 'OutForDelivery'
  | 'ReadyForPickup'
  | 'Completed'
  | 'Rejected'
  | 'Cancelled'

export interface CartLineRequest {
  menuItemId: number
  quantity: number
  optionIds: number[]
  note?: string
}

export interface PricingProblem {
  code: string
  message: string
  lineIndex: number | null
}

export interface PricedOption {
  groupId: number
  groupTitle: string
  optionId: number
  name: string
  price: number
}

export interface PricedLine {
  menuItemId: number
  name: string
  unitPrice: number
  quantity: number
  lineTotal: number
  note: string | null
  options: PricedOption[]
}

export interface QuoteRequest {
  type: OrderType
  deliveryAreaId: number | null
  promoCode: string | null
  lines: CartLineRequest[]
}

export interface Quote {
  lines: PricedLine[]
  subtotal: number
  discount: number
  deliveryFee: number
  tax: number
  total: number
  promoCode: string | null
  promoMessage: string | null
  problems: PricingProblem[]
}

export interface PlaceOrderRequest extends QuoteRequest {
  clientRequestId: string
  addressLine: string | null
  landmark: string | null
  saveAddress: boolean
  customerName: string
  notes: string | null
  paymentMethod: PaymentMethod
}

export interface OrderItem {
  menuItemId: number | null
  name: string
  unitPrice: number
  quantity: number
  lineTotal: number
  note: string | null
  options: { optionId: number | null; groupTitle: string; name: string; price: number }[]
}

export interface Order {
  publicId: string
  orderNumber: number
  status: OrderStatus
  type: OrderType
  customerName: string
  customerPhone: string
  deliveryAreaName: string | null
  addressLine: string | null
  landmark: string | null
  notes: string | null
  subtotal: number
  discount: number
  deliveryFee: number
  tax: number
  total: number
  promoCode: string | null
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  rejectReason: string | null
  createdAt: string
  placedAt: string | null
  estimatedReadyAt: string | null
  items: OrderItem[]
  events: { status: OrderStatus; at: string; note: string | null }[]
}

export interface OrderSummary {
  publicId: string
  orderNumber: number
  status: OrderStatus
  type: OrderType
  total: number
  itemCount: number
  itemsPreview: string
  createdAt: string
}

// ---- HTTP ----

export class ApiError extends Error {
  readonly status: number
  /** Checkout problems returned with 422. */
  readonly problems: PricingProblem[]

  constructor(status: number, message: string, problems: PricingProblem[] = []) {
    super(message)
    this.status = status
    this.problems = problems
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })

  if (!response.ok) {
    // ProblemDetails ({ detail }) or checkout problems ({ problems: [...] }).
    const payload = (await response.json().catch(() => null)) as { detail?: string; problems?: PricingProblem[] } | null
    const problems = payload?.problems ?? []
    const message =
      payload?.detail ??
      problems[0]?.message ??
      (response.status === 429 ? 'Too many attempts — please wait a moment and try again.' : 'Something went wrong. Please try again.')
    throw new ApiError(response.status, message, problems)
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

export const api = {
  menu: () => request<Menu>('GET', '/api/menu'),
  store: () => request<Store>('GET', '/api/store'),

  authConfig: () => request<{ turnstileSiteKey: string | null }>('GET', '/api/auth/config'),
  me: () => request<{ customer: Customer | null }>('GET', '/api/me'),
  sendCode: (phone: string, turnstileToken: string | null) =>
    request<SendCodeResponse>('POST', '/api/auth/code', { phone, turnstileToken }),
  verifyCode: (phone: string, code: string) => request<{ customer: Customer }>('POST', '/api/auth/verify', { phone, code }),
  logout: () => request<void>('POST', '/api/auth/logout', {}),

  quote: (body: QuoteRequest) => request<Quote>('POST', '/api/checkout/quote', body),
  placeOrder: (body: PlaceOrderRequest) => request<Order>('POST', '/api/orders', body),
  myOrders: () => request<OrderSummary[]>('GET', '/api/orders'),
  order: (publicId: string) => request<Order>('GET', `/api/orders/${encodeURIComponent(publicId)}`),
}
