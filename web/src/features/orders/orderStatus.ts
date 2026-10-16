import type { OrderStatus, OrderType } from '../../lib/api'

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PendingPayment: 'Awaiting payment',
  Placed: 'Order received',
  Accepted: 'Confirmed',
  Preparing: 'Being prepared',
  OutForDelivery: 'Out for delivery',
  ReadyForPickup: 'Ready for pick-up',
  Completed: 'Completed',
  Rejected: 'Not accepted',
  Cancelled: 'Cancelled',
}

/** Customer-facing explanation of what's happening right now. */
export function statusMessage(status: OrderStatus, type: OrderType): string {
  switch (status) {
    case 'PendingPayment':
      return 'We’re waiting for your payment to go through.'
    case 'Placed':
      return 'We’ve received your order and will confirm it shortly.'
    case 'Accepted':
      return 'The kitchen has confirmed your order.'
    case 'Preparing':
      return 'Your food is being freshly made.'
    case 'OutForDelivery':
      return 'Your rider is on the way!'
    case 'ReadyForPickup':
      return 'Your order is ready — come pick it up.'
    case 'Completed':
      return type === 'Delivery' ? 'Delivered. Enjoy your meal!' : 'Picked up. Enjoy your meal!'
    case 'Rejected':
      return 'Sorry, we couldn’t accept this order.'
    case 'Cancelled':
      return 'This order was cancelled.'
  }
}

/** The happy-path steps shown as a progress tracker. */
export function statusSteps(type: OrderType): OrderStatus[] {
  return ['Placed', 'Accepted', 'Preparing', type === 'Delivery' ? 'OutForDelivery' : 'ReadyForPickup', 'Completed']
}

export const isFinalStatus = (status: OrderStatus) => ['Completed', 'Rejected', 'Cancelled'].includes(status)
