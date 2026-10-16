import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from './api'

export function useMenu() {
  return useQuery({ queryKey: ['menu'], queryFn: api.menu, staleTime: 60_000 })
}

/** Store info + live open/closed status, refreshed every minute. */
export function useStore() {
  return useQuery({
    queryKey: ['store'],
    queryFn: api.store,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

/** The signed-in customer, or null. */
export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: async () => (await api.me()).customer, staleTime: 5 * 60_000 })
}

export function useMyOrders(enabled: boolean) {
  return useQuery({ queryKey: ['orders'], queryFn: api.myOrders, enabled })
}

const isFinal = (status: string) => ['Completed', 'Rejected', 'Cancelled'].includes(status)

/** One order; polls every 30s as a fallback to the live connection until it's finished. */
export function useOrder(publicId: string) {
  return useQuery({
    queryKey: ['order', publicId],
    queryFn: () => api.order(publicId),
    retry: (count, error) => !(error instanceof ApiError && [401, 404].includes(error.status)) && count < 2,
    refetchInterval: (query) => (query.state.data && isFinal(query.state.data.status) ? false : 30_000),
  })
}
