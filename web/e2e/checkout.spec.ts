import { expect, test, type Page } from '@playwright/test'

async function snap(page: Page, name: string) {
  const dir = process.env.SCREENSHOT_DIR
  if (dir) await page.screenshot({ path: `${dir}/${test.info().project.name}-${name}.png`, fullPage: true })
}

const randomPhone = () => `03${Math.floor(Math.random() * 10)}${Math.floor(1_000_000 + Math.random() * 8_999_999)}${Math.floor(Math.random() * 10)}`

/** Signs in on whatever page shows the phone form, using the development code shown on screen. */
async function signIn(page: Page, phone = randomPhone()) {
  await page.getByLabel('Mobile number').fill(phone)
  await page.getByRole('button', { name: 'Send code' }).click()
  const code = await page.locator('.font-mono.font-bold').textContent()
  await page.getByLabel('6-digit code').fill(code!.trim())
  await page.getByRole('button', { name: 'Verify' }).click()
  return phone
}

test.beforeEach(async ({ page, request }) => {
  const store = await (await request.get('/api/store')).json()
  test.skip(!store.status.canOrder, 'The shop is closed or paused right now, so orders cannot be placed.')
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
})

test('customer places a cash-on-delivery order and tracks it', async ({ page }) => {
  // Build the cart: Crispy Zinger meal with Pepsi = Rs 780.
  await page.goto('/menu?item=crispy-zinger')
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Make it a meal (fries + drink)').check()
  await dialog.getByLabel('Pepsi').check()
  await dialog.getByRole('button', { name: 'Add · Rs 780' }).click()

  await page.goto('/checkout')
  await expect(page.getByRole('heading', { name: 'Checkout', level: 1 })).toBeVisible()

  // Placing is impossible before verifying the phone.
  await expect(page.getByText('Verify your mobile number above')).toBeVisible()
  const phone = await signIn(page)
  await expect(page.getByText('Signed in as')).toBeVisible()

  await page.getByLabel('Your name').fill('Playwright Tester')
  await page.getByLabel('Area').selectOption({ label: 'DHA Phase 8 — delivery Rs 100, min Rs 500' })
  await page.getByLabel('Address', { exact: true }).fill('House 7, Street 3, Block D')

  // Server-calculated totals: 780 + 100 delivery.
  const summary = page.getByRole('complementary', { name: 'Order summary' })
  await expect(summary.getByText('Rs 880', { exact: true })).toBeVisible()
  await snap(page, 'checkout')

  await summary.getByRole('button', { name: 'Place order · Rs 880' }).click()

  // Tracking page
  await expect(page).toHaveURL(/\/order\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'Order received' })).toBeVisible()
  await expect(page.getByText(/Order #\d{4,}/)).toBeVisible()
  await expect(page.getByText('Cash on delivery — please have Rs 880 ready.')).toBeVisible()
  await expect(page.getByText('House 7, Street 3, Block D')).toBeVisible()
  await expect(page.getByRole('button', { name: /Open cart, 0 items/ })).toBeVisible()
  await snap(page, 'order-tracking')

  // My orders shows it, and "Order again" refills the cart.
  await page.goto('/orders')
  await expect(page.getByText(phone.replace(/^(\d{4})/, '$1-'))).toBeVisible()
  await page.getByRole('link', { name: /Crispy Zinger/ }).click()
  await page.getByRole('button', { name: 'Order again' }).click()
  await expect(page.getByRole('dialog', { name: 'Your order' }).getByText('Crispy Zinger')).toBeVisible()
})

test('returning customer gets their saved address', async ({ page }) => {
  const phone = randomPhone()

  // First order saves the address.
  await page.goto('/menu?item=loaded-fries')
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Honey Mustard').check()
  await dialog.getByLabel('Sriracha').check()
  await dialog.getByRole('button', { name: 'Add · Rs 570' }).click()
  await page.goto('/checkout')
  await signIn(page, phone)
  await page.getByLabel('Your name').fill('Returning Customer')
  await page.getByLabel('Area').selectOption({ index: 1 })
  await page.getByLabel('Address', { exact: true }).fill('Flat 2, Plaza 9, Commercial Area')
  await page.getByRole('button', { name: /Place order · Rs/ }).click()
  await expect(page.getByRole('heading', { name: 'Order received' })).toBeVisible()

  // Next visit: name and address are remembered.
  await page.goto('/menu?item=loaded-fries')
  await page.getByRole('dialog').getByLabel('Cocktail').check()
  await page.getByRole('dialog').getByLabel('BBQ Mustard').check()
  await page.getByRole('dialog').getByRole('button', { name: 'Add · Rs 570' }).click()
  await page.goto('/checkout')
  await expect(page.getByLabel('Your name')).toHaveValue('Returning Customer')
  await expect(page.getByRole('radio', { name: /Flat 2, Plaza 9/ })).toHaveAttribute('aria-checked', 'true')
})

test('pick-up order with a bad promo code explains why', async ({ page }) => {
  await page.goto('/menu?item=tiramisu')
  await page.getByRole('dialog').getByRole('button', { name: 'Add · Rs 450' }).click()
  await page.goto('/checkout')
  await signIn(page)
  await page.getByLabel('Your name').fill('Promo Tester')
  await page.getByRole('radio', { name: /Pick-up/ }).click()

  await page.getByLabel('Promo code').fill('NOTACODE')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText('That promo code isn\'t valid.')).toBeVisible()

  await page.getByRole('button', { name: 'Remove promo code' }).click()
  await page.getByRole('button', { name: 'Place order · Rs 450' }).click()
  await expect(page.getByText('Pay Rs 450 at pick-up.')).toBeVisible()
})
