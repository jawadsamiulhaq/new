import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

/**
 * Subscribes to live updates for one order over SignalR and refreshes it when the
 * kitchen changes its status. Reconnects automatically; polling in useOrder is the fallback.
 */
export function useOrderLive(publicId: string, enabled: boolean) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled) return

    const connection = new HubConnectionBuilder()
      .withUrl('/hubs/orders')
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build()

    const refresh = () => queryClient.invalidateQueries({ queryKey: ['order', publicId] })
    const track = () => connection.invoke<boolean>('Track', publicId).catch(() => false)

    connection.on('orderUpdated', (id: string) => {
      if (id === publicId) refresh()
    })
    connection.onreconnected(() => {
      void track()
      void refresh() // catch up on anything missed while offline
    })

    let stopped = false
    connection
      .start()
      .then(() => (stopped ? undefined : track()))
      .catch(() => {
        /* polling keeps the page up to date */
      })

    return () => {
      stopped = true
      void connection.stop()
    }
  }, [publicId, enabled, queryClient])
}
