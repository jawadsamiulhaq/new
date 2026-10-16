import { expect, test, type Page } from '@playwright/test'

/** Optional: set SCREENSHOT_DIR to save review screenshots of key screens. */
async function snap(page: Page, name: string) {
  const dir = process.env.SCREENSHOT_DIR
  if (dir) await page.screenshot({ path: `${dir}/${test.info().project.name}-${name}.png`, fullPage: false })
}

test.beforeEach(async ({ page }) => {
  // Start every test with an empty cart.
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
})

test('home page shows the brand, popular picks and Bake Dukan', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Burgers. Grilled chicken.')
  await expect(page.getByRole('heading', { name: 'Popular picks' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Add Crispy Zinger/ })).toBeVisible()
  await expect(page.getByText('Bake Dukan', { exact: true }).first()).toBeVisible()
  await snap(page, 'home')
})

test('menu lists every category and search filters items', async ({ page }) => {
  await page.goto('/menu')
  for (const name of ['Chicken Burgers', 'Wraps', 'Crispy Wings', 'Bake Dukan Desserts', 'Beverages']) {
    await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible()
  }
  await snap(page, 'menu')

  await page.getByLabel('Search the menu').fill('zinger')
  await expect(page.getByRole('button', { name: /Add Crispy Zinger/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Add Tiramisu/ })).toHaveCount(0)

  await page.getByLabel('Search the menu').fill('qwerty')
  await expect(page.getByText('Nothing matches')).toBeVisible()
})

test('burger with meal, drink and cheese is priced correctly and validated', async ({ page }) => {
  await page.goto('/menu')
  await page.getByRole('button', { name: /Add Crispy Zinger/ }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Crispy Zinger' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Add · Rs 560' })).toBeVisible()
  await expect(dialog.getByText('Meal drink')).toHaveCount(0)

  // Meal reveals the required drink choice.
  await dialog.getByLabel('Make it a meal (fries + drink)').check()
  await expect(dialog.getByText('Meal drink')).toBeVisible()
  await dialog.getByRole('button', { name: 'Add · Rs 780' }).click()
  await expect(dialog.getByRole('alert')).toContainText('choose 1')

  await dialog.getByLabel('Pepsi').check()
  await dialog.getByLabel('Cheese Slice').check()
  await snap(page, 'item-dialog')
  await dialog.getByRole('button', { name: 'Add · Rs 860' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Added Crispy Zinger to your cart')).toBeVisible()
  await expect(page.getByRole('button', { name: /Open cart, 1 item/ })).toBeVisible()
})

test('bucket includes two sauces and charges for the third', async ({ page }) => {
  await page.goto('/menu?item=bbq-bucket')
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Honey Mustard').check()
  await dialog.getByLabel('Cocktail').check()
  await expect(dialog.getByRole('button', { name: 'Add · Rs 400' })).toBeVisible()
  await dialog.getByLabel('Sriracha').check()
  await expect(dialog.getByRole('button', { name: 'Add · Rs 480' })).toBeVisible()
})

test('cart drawer totals, quantity and persistence', async ({ page, request }) => {
  await page.goto('/menu?item=plain-fries')
  await page.getByRole('dialog').getByRole('button', { name: 'Add · Rs 230' }).click()
  await page.goto('/menu?item=karak-chai')
  await page.getByRole('dialog').getByRole('button', { name: 'Add · Rs 250' }).click()

  await page.reload()
  await page.getByRole('button', { name: /Open cart, 2 items/ }).click()
  const cart = page.getByRole('dialog', { name: 'Your order' })
  await expect(cart.getByText('Rs 480', { exact: true })).toBeVisible()

  await cart.getByRole('button', { name: 'Increase quantity' }).first().click()
  await expect(cart.getByText('Rs 710', { exact: true })).toBeVisible()
  await snap(page, 'cart')

  // Checkout is only offered while the shop is open and not paused.
  const store = await (await request.get('/api/store')).json()
  if (store.status.canOrder) {
    await expect(cart.getByRole('link', { name: /Checkout · Rs 710/ })).toBeVisible()
  } else {
    await expect(cart.getByRole('button', { name: 'Ordering unavailable right now' })).toBeDisabled()
  }

  await cart.getByRole('button', { name: 'Remove Plain Fries' }).click()
  await expect(cart.getByRole('button', { name: /Remove/ })).toHaveCount(1)
  await expect(cart.getByText('Rs 250', { exact: true }).first()).toBeVisible()
})

test('shared item link opens the dialog and closing clears it', async ({ page }) => {
  await page.goto('/menu?item=loaded-fries')
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Loaded Fries' })).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/menu$/)
})

test('back button closes an item opened from the menu', async ({ page }) => {
  await page.goto('/menu')
  await page.getByRole('button', { name: /Add Tiramisu/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/menu$/)
})

test('find us page shows address and hours', async ({ page }) => {
  await page.goto('/about')
  await expect(page.getByText('185/1 D Block, DHA Phase 8').first()).toBeVisible()
  await expect(page.getByRole('main').getByRole('heading', { name: 'Opening hours' })).toBeVisible()
  await snap(page, 'about')
})

test('public pages load without errors or blocked resources', async ({ page }) => {
  const problems: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(msg.text())
  })
  page.on('pageerror', (err) => problems.push(err.message))

  for (const path of ['/', '/menu', '/about', '/privacy', '/terms', '/refunds', '/delivery', '/menu?item=crispy-zinger']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
  }
  expect(problems, problems.join('\n')).toEqual([])
})

test('policy pages are reachable from the footer', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click()
  await expect(page.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeVisible()
  await page.getByRole('navigation', { name: 'Policies' }).first().getByRole('link', { name: 'Delivery' }).click()
  await expect(page.getByRole('heading', { name: 'Delivery Policy', level: 1 })).toBeVisible()
  await expect(page.getByText(/DHA Phase 8 — Rs 100 delivery/)).toBeVisible()
  await snap(page, 'delivery-policy')
})

test('unknown pages show a friendly 404', async ({ page }) => {
  await page.goto('/no-such-page')
  await expect(page.getByText('This page went out for delivery')).toBeVisible()
})
