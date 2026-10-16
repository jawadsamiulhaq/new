import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

export type HubStatus = 'connecting' | 'live' | 'offline'

/**
 * Keeps the admin screens live: new orders and status changes refresh the order
 * queries instantly; store changes (pause) refresh settings. Returns the connection state
 * so the board can warn when it's offline (it still polls as a fallback).
 */
export function useStaffHub(onOrderPlaced?: (orderNumber: number) => void) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<HubStatus>('connecting')
  const onOrderPlacedRef = useRef(onOrderPlaced)
  useEffect(() => {
    onOrderPlacedRef.current = onOrderPlaced
  })

  useEffect(() => {
    const connection = new HubConnectionBuilder()
      .withUrl('/hubs/staff')
      .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (ctx) => Math.min(30_000, 1_000 * 2 ** ctx.previousRetryCount) })
      .configureLogging(LogLevel.Warning)
      .build()

    const refreshOrders = () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'live'] })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
    }

    connection.on('orderPlaced', (_id: number, orderNumber: number) => {
      refreshOrders()
      onOrderPlacedRef.current?.(orderNumber)
    })
    connection.on('orderUpdated', refreshOrders)
    connection.on('storeChanged', () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
      void queryClient.invalidateQueries({ queryKey: ['store'] })
    })
    connection.onreconnecting(() => setStatus('connecting'))
    connection.onreconnected(() => {
      setStatus('live')
      refreshOrders() // catch up on anything missed
    })
    connection.onclose(() => setStatus('offline'))

    let disposed = false
    const start = async () => {
      try {
        await connection.start()
        if (!disposed) setStatus('live')
      } catch {
        if (disposed) return
        setStatus('offline')
        setTimeout(() => {
          if (!disposed && connection.state === HubConnectionState.Disconnected) void start()
        }, 5_000)
      }
    }
    void start()

    return () => {
      disposed = true
      void connection.stop()
    }
  }, [queryClient])

  return status
}
