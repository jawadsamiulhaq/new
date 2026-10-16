// Admin API client. Types mirror api/BurChips.Api/Features/Admin/*.
import { ApiError, type Brand, type Order, type OrderStatus, type OrderType, type PaymentMethod } from '../lib/api'

export type Role = 'Owner' | 'Staff'

export interface StaffMe {
  id: string
  email: string
  displayName: string
  role: Role
}

export interface AdminOrder {
  id: number
  order: Order
  nextStatuses: OrderStatus[]
}

export interface AdminOrderRow {
  id: number
  publicId: string
  orderNumber: number
  status: OrderStatus
  type: OrderType
  customerName: string
  customerPhone: string
  deliveryAreaName: string | null
  total: number
  paymentMethod: PaymentMethod
  createdAt: string
}

export interface OrderPage {
  items: AdminOrderRow[]
  total: number
  page: number
  pageSize: number
}

export interface ItemGroupLink {
  optionGroupId: number
  title: string
  minSelect: number
  maxSelect: number
  freeSelections: number
  dependsOnOptionId: number | null
}

export interface AdminItem {
  id: number
  categoryId: number
  name: string
  slug: string
  description: string | null
  price: number
  imageUrl: string | null
  isAvailable: boolean
  isActive: boolean
  isFeatured: boolean
  sortOrder: number
  leadTimeHours: number
  optionGroups: ItemGroupLink[]
}

export interface AdminCategory {
  id: number
  name: string
  slug: string
  description: string | null
  brand: Brand
  sortOrder: number
  isActive: boolean
  items: AdminItem[]
}

export interface AdminOption {
  id: number
  name: string
  priceDelta: number
  isAvailable: boolean
  sortOrder: number
}

export interface AdminOptionGroup {
  id: number
  name: string
  options: AdminOption[]
  usedByItems: number
}

export interface AdminMenu {
  categories: AdminCategory[]
  optionGroups: AdminOptionGroup[]
}

export type ItemInput = Omit<AdminItem, 'id' | 'slug' | 'imageUrl' | 'sortOrder'>

export interface Area {
  id: number
  name: string
  fee: number
  minOrder: number
  isActive: boolean
  sortOrder: number
}

export type DiscountType = 'Percent' | 'Flat'

export interface Promo {
  id: number
  code: string
  description: string | null
  discountType: DiscountType
  value: number
  maxDiscount: number | null
  minOrder: number
  startsAt: string | null
  expiresAt: string | null
  maxUses: number | null
  maxUsesPerCustomer: number | null
  firstOrderOnly: boolean
  isActive: boolean
  usedCount: number
}

export type PromoInput = Omit<Promo, 'id' | 'usedCount'>

export interface DayHours {
  day: string
  opensAt: string
  closesAt: string
  isClosed: boolean
}

export interface Settings {
  storeName: string
  phone: string
  whatsAppNumber: string | null
  address: string
  isPaused: boolean
  pauseMessage: string | null
  deliveryEnabled: boolean
  pickupEnabled: boolean
  codEnabled: boolean
  payFastEnabled: boolean
  freeDeliveryThreshold: number | null
  taxPercent: number
  pricesIncludeTax: boolean
  estimatedDeliveryMinutes: number
  estimatedPickupMinutes: number
  hours: DayHours[]
}

export interface StaffMember {
  id: string
  email: string
  displayName: string
  role: Role
  isActive: boolean
  isLockedOut: boolean
  isYou: boolean
}

export interface SalesReport {
  from: string
  to: string
  orders: number
  revenue: number
  averageOrder: number
  discounts: number
  deliveryFees: number
  delivery: number
  pickup: number
  cashRevenue: number
  onlineRevenue: number
  rejected: number
  cancelled: number
  byDay: { date: string; orders: number; revenue: number }[]
  topItems: { name: string; quantity: number; revenue: number }[]
}

// ---- HTTP with anti-forgery token ----

let csrfToken: string | null = null

async function refreshCsrf() {
  const response = await fetch('/api/admin/auth/csrf', { credentials: 'same-origin' })
  csrfToken = response.ok ? ((await response.json()) as { token: string }).token : null
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

async function send<T>(method: Method, path: string, body?: unknown, retried = false): Promise<T> {
  if (method !== 'GET' && !csrfToken && !path.endsWith('/auth/login')) await refreshCsrf()

  const isForm = body instanceof FormData
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && csrfToken) headers['X-XSRF-TOKEN'] = csrfToken

  const response = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null
    // Token expired (e.g. after the session was refreshed) — get a new one and retry once.
    if (response.status === 400 && payload?.detail?.includes('security token') && !retried) {
      await refreshCsrf()
      return send<T>(method, path, body, true)
    }
    const message =
      payload?.detail ??
      (response.status === 429
        ? 'Too many attempts — please wait a few minutes and try again.'
        : response.status === 401
        ? 'Please sign in again.'
        : response.status === 403
          ? 'Only the owner can do that.'
          : 'Something went wrong. Please try again.')
    throw new ApiError(response.status, message)
  }

  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

const get = <T,>(path: string) => send<T>('GET', path)

export const adminApi = {
  // auth
  login: async (email: string, password: string) => {
    const me = await send<StaffMe>('POST', '/api/admin/auth/login', { email, password })
    await refreshCsrf()
    return me
  },
  me: async (): Promise<StaffMe | null> => {
    try {
      const me = await get<StaffMe>('/api/admin/auth/me')
      if (!csrfToken) await refreshCsrf()
      return me
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null
      throw e
    }
  },
  logout: async () => {
    await send<void>('POST', '/api/admin/auth/logout', {})
    csrfToken = null
  },
  changePassword: (currentPassword: string, newPassword: string) =>
    send<void>('POST', '/api/admin/auth/password', { currentPassword, newPassword }),

  // orders
  liveOrders: () => get<AdminOrder[]>('/api/admin/orders/live'),
  order: (id: number) => get<AdminOrder>(`/api/admin/orders/${id}`),
  searchOrders: (params: URLSearchParams) => get<OrderPage>(`/api/admin/orders?${params}`),
  setStatus: (id: number, status: OrderStatus, note?: string) =>
    send<AdminOrder>('POST', `/api/admin/orders/${id}/status`, { status, note: note ?? null }),

  // store
  pause: (isPaused: boolean, message?: string) => send<void>('POST', '/api/admin/store/pause', { isPaused, message: message ?? null }),
  settings: () => get<Settings>('/api/admin/settings'),
  saveSettings: (s: Settings) => send<void>('PUT', '/api/admin/settings', s),

  // menu
  menu: () => get<AdminMenu>('/api/admin/menu'),
  setItemAvailable: (id: number, isAvailable: boolean) => send<void>('POST', `/api/admin/menu/items/${id}/availability`, { isAvailable }),
  setOptionAvailable: (id: number, isAvailable: boolean) => send<void>('POST', `/api/admin/menu/options/${id}/availability`, { isAvailable }),
  createCategory: (c: { name: string; description: string | null; brand: Brand; isActive: boolean }) =>
    send<{ id: number }>('POST', '/api/admin/menu/categories', c),
  updateCategory: (id: number, c: { name: string; description: string | null; brand: Brand; isActive: boolean }) =>
    send<void>('PUT', `/api/admin/menu/categories/${id}`, c),
  deleteCategory: (id: number) => send<void>('DELETE', `/api/admin/menu/categories/${id}`),
  reorderCategories: (ids: number[]) => send<void>('POST', '/api/admin/menu/categories/reorder', { ids }),
  createItem: (item: ItemInput) => send<{ id: number }>('POST', '/api/admin/menu/items', item),
  updateItem: (id: number, item: ItemInput) => send<void>('PUT', `/api/admin/menu/items/${id}`, item),
  deleteItem: (id: number) => send<void>('DELETE', `/api/admin/menu/items/${id}`),
  reorderItems: (categoryId: number, ids: number[]) => send<void>('POST', `/api/admin/menu/categories/${categoryId}/items/reorder`, { ids }),
  uploadImage: (id: number, file: Blob) => {
    const form = new FormData()
    form.append('file', file, 'photo.webp')
    return send<{ imageUrl: string }>('POST', `/api/admin/menu/items/${id}/image`, form)
  },
  deleteImage: (id: number) => send<void>('DELETE', `/api/admin/menu/items/${id}/image`),
  createOptionGroup: (g: { name: string; options: { id: number | null; name: string; priceDelta: number; isAvailable: boolean }[] }) =>
    send<{ id: number }>('POST', '/api/admin/menu/option-groups', g),
  updateOptionGroup: (id: number, g: { name: string; options: { id: number | null; name: string; priceDelta: number; isAvailable: boolean }[] }) =>
    send<void>('PUT', `/api/admin/menu/option-groups/${id}`, g),
  deleteOptionGroup: (id: number) => send<void>('DELETE', `/api/admin/menu/option-groups/${id}`),

  // areas & promos
  areas: () => get<Area[]>('/api/admin/areas'),
  createArea: (a: Omit<Area, 'id' | 'sortOrder'>) => send<{ id: number }>('POST', '/api/admin/areas', a),
  updateArea: (id: number, a: Omit<Area, 'id' | 'sortOrder'>) => send<void>('PUT', `/api/admin/areas/${id}`, a),
  deleteArea: (id: number) => send<void>('DELETE', `/api/admin/areas/${id}`),
  promos: () => get<Promo[]>('/api/admin/promos'),
  createPromo: (p: PromoInput) => send<{ id: number }>('POST', '/api/admin/promos', p),
  updatePromo: (id: number, p: PromoInput) => send<void>('PUT', `/api/admin/promos/${id}`, p),

  // staff & reports
  staff: () => get<StaffMember[]>('/api/admin/staff'),
  createStaff: (s: { email: string; displayName: string; role: Role; password: string }) => send<{ id: string }>('POST', '/api/admin/staff', s),
  updateStaff: (id: string, s: { displayName: string; role: Role; isActive: boolean }) => send<void>('PUT', `/api/admin/staff/${id}`, s),
  resetStaffPassword: (id: string, password: string) => send<void>('POST', `/api/admin/staff/${id}/password`, { password }),
  sales: (from: string, to: string) => get<SalesReport>(`/api/admin/reports/sales?from=${from}&to=${to}`),
}
