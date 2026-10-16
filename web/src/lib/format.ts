const rupees = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 })

/** Formats a price the way the menu prints it: "Rs 560". */
export function formatPrice(amount: number): string {
  return `Rs ${rupees.format(amount)}`
}
