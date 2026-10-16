import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { useToast } from '../components/toastStore'
import { adminApi } from './adminApi'
import { ringer } from './ringer'

export function useStaffMe() {
  return useQuery({ queryKey: ['admin', 'me'], queryFn: adminApi.me, staleTime: 5 * 60_000 })
}

/** Live orders are loaded by the layout so new orders ring on every admin page. */
export function useLiveOrders() {
  return useQuery({ queryKey: ['admin', 'live'], queryFn: adminApi.liveOrders, refetchInterval: 20_000 })
}

export function useAdminMenu() {
  return useQuery({ queryKey: ['admin', 'menu'], queryFn: adminApi.menu })
}

/** Re-renders when the order bell starts, stops or begins ringing. */
export function useRinger() {
  return useSyncExternalStore(
    (cb) => ringer.subscribe(cb),
    () => `${ringer.started}:${ringer.ringing}`,
  )
}

/**
 * A mutation that refreshes the given queries on success and shows errors as a toast,
 * so every admin action gives visible feedback.
 */
export function useAdminMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  options: { invalidate?: QueryKey[]; success?: string; onSuccess?: (result: TResult, args: TArgs) => void } = {},
) {
  const queryClient = useQueryClient()
  const toast = useToast((s) => s.show)
  return useMutation({
    mutationFn: fn,
    onSuccess: (result, args) => {
      options.invalidate?.forEach((key) => queryClient.invalidateQueries({ queryKey: key }))
      if (options.success) toast(options.success)
      options.onSuccess?.(result, args)
    },
    onError: (error) => toast(error.message, 'error'),
  })
}
