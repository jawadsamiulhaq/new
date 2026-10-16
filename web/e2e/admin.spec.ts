import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * Admin end-to-end tests. Needs the development owner login in E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD
 * (the values set with `dotnet user-secrets`); skipped otherwise.
 */
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD

test.skip(!OWNER_EMAIL || !OWNER_PASSWORD, 'Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run admin tests.')

async function snap(page: Page, name: string) {
  const dir = process.env.SCREENSHOT_DIR
  if (dir) await page.screenshot({ path: `${dir}/${test.info().project.name}-${name}.png`, fullPage: true })
}

async function ownerLogin(page: Page) {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login/)
  await page.getByLabel('Email').fill(OWNER_EMAIL!)
  await page.getByLabel('Password').fill(OWNER_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'New' })).toBeVisible()
}

/** A separate customer browser that places a cash pick-up order; returns the page on the tracking screen. */
async function customerOrders(browser: Browser): Promise<{ page: Page; orderNumber: string }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/menu?item=water')
  await page.getByRole('dialog').getByRole('button', { name: 'Add · Rs 100' }).click()
  await page.goto('/checkout')
  const phone = `03${Math.floor(Math.random() * 10)}${Math.floor(1_000_000 + Math.random() * 8_999_999)}${Math.floor(Math.random() * 10)}`
  await page.getByLabel('Mobile number').fill(phone)
  await page.getByRole('button', { name: 'Send code' }).click()
  const code = await page.locator('.font-mono.font-bold').textContent()
  await page.getByLabel('6-digit code').fill(code!.trim())
  await page.getByRole('button', { name: 'Verify' }).click()
  await page.getByLabel('Your name').fill('Admin E2E Customer')
  await page.getByRole('radio', { name: /Pick-up/ }).click()
  await page.getByRole('button', { name: 'Place order · Rs 100' }).click()
  await expect(page.getByRole('heading', { name: 'Order received' })).toBeVisible()
  const orderNumber = (await page.getByText(/Order #\d+/).textContent())!.match(/#(\d+)/)![1]
  return { page, orderNumber }
}

test('anonymous visitors are sent to the staff sign-in', async ({ page }) => {
  await page.goto('/admin/menu')
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fmenu/)
  await page.getByLabel('Email').fill('nobody@example.com')
  await page.getByLabel('Password').fill('wrong-password-123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('incorrect')
})

test('new order appears live, owner accepts it, customer page updates by itself', async ({ page, browser, request }) => {
  const store = await (await request.get('/api/store')).json()
  test.skip(!store.status.canOrder, 'The shop is closed or paused right now.')

  await ownerLogin(page)
  await snap(page, 'admin-live-empty')

  const customer = await customerOrders(browser)

  // Arrives on the board without refreshing.
  const card = page.getByRole('article', { name: `Order ${customer.orderNumber}` })
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card.getByText('Admin E2E Customer')).toBeVisible()
  await expect(page.getByRole('link', { name: /Live orders/ })).toContainText(/\d/) // waiting badge
  await snap(page, 'admin-live-new-order')

  await card.getByRole('button', { name: 'Accept' }).click()
  await expect(card.getByRole('button', { name: 'Start preparing' })).toBeVisible()

  // The customer's tracking page updates over the live connection.
  await expect(customer.page.getByRole('heading', { name: 'Confirmed' })).toBeVisible({ timeout: 15_000 })

  await card.getByRole('button', { name: 'Start preparing' }).click()
  await card.getByRole('button', { name: 'Ready for pick-up' }).click()
  await expect(customer.page.getByRole('heading', { name: 'Ready for pick-up' })).toBeVisible({ timeout: 15_000 })
  await card.getByRole('button', { name: 'Picked up' }).click()
  await expect(customer.page.getByRole('heading', { name: 'Completed' })).toBeVisible({ timeout: 15_000 })
  await customer.page.context().close()
})

test('owner marks an item sold out and customers see it', async ({ page, browser }) => {
  await ownerLogin(page)
  await page.getByRole('link', { name: 'Menu' }).click()
  const toggle = page.getByRole('switch', { name: 'Cardamom Tea available' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await snap(page, 'admin-menu')

  const customer = await (await browser.newContext()).newPage()
  try {
    await customer.goto('/menu')
    await expect(customer.getByRole('button', { name: 'Cardamom Tea is sold out' })).toBeVisible()
  } finally {
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await customer.context().close()
  }
})

test('pausing online orders shows customers a banner', async ({ page, browser }) => {
  await ownerLogin(page)
  await page.getByRole('switch', { name: 'Pause online orders' }).click()
  await page.getByLabel('Message for customers (optional)').fill('Back in 15 minutes')
  await page.getByRole('button', { name: 'Pause orders' }).click()
  await expect(page.getByText('Online orders paused')).toBeVisible()

  const customer = await (await browser.newContext()).newPage()
  try {
    await customer.goto('/')
    await expect(customer.getByRole('status').filter({ hasText: 'Back in 15 minutes' })).toBeVisible()
  } finally {
    await page.getByRole('switch', { name: 'Resume online orders' }).click()
    await expect(page.getByText('Taking online orders')).toBeVisible()
    await customer.context().close()
  }
})

test('owner pages: settings, areas, promos, staff and reports load', async ({ page }) => {
  await ownerLogin(page)
  for (const [link, heading] of [
    ['Settings & hours', 'Settings & hours'],
    ['Delivery areas', 'Delivery areas'],
    ['Promo codes', 'Promo codes'],
    ['Staff', 'Staff'],
    ['Reports', 'Reports'],
    ['Order history', 'Order history'],
    ['Options & sauces', 'Options & sauces'],
  ]) {
    await page.getByRole('link', { name: link }).click()
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
  }

  await page.getByRole('link', { name: 'Reports' }).click()
  await expect(page.getByRole('list', { name: 'Sales by day' })).toBeVisible()
  await page.getByRole('listitem').last().hover()
  await expect(page.getByRole('tooltip')).toBeVisible()
  await snap(page, 'admin-reports')

  await page.getByRole('link', { name: 'Order history' }).click()
  await page.getByRole('row').nth(1).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await snap(page, 'admin-history-detail')
})
