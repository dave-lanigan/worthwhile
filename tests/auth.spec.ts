import { expect, test } from '@playwright/test'
import { clerk, clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright'
import { emptyPlan } from '../shared/schemas/financial-plan'

test.beforeAll(async () => { await clerkSetup() })

test('the homepage is public while saved plans require sign-in', async ({ page, request }, testInfo) => {
  for (const path of ['/api/plan', '/api/%70lan']) {
    expect((await request.get(path)).status()).toBe(401)
    expect((await request.put(path, { data: {} })).status()).toBe(401)
  }
  const publicResponse = await request.get('/', { maxRedirects: 0 })
  expect(publicResponse.status()).toBe(200)
  expect(await publicResponse.text()).toContain('Net worth estimator')
  await setupClerkTestingToken({ page })
  const planRequests: string[] = []
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/plan') planRequests.push(request.method())
  })
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  for (let navigation = response!.request(); navigation; navigation = navigation.redirectedFrom()!) {
    expect(new URL(navigation.url()).pathname).not.toMatch(/^\/sign-(in|up)/)
  }
  expect(await response!.text()).toContain('Net worth estimator')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Net worth estimator' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('Saved locally')
  await expect(page.locator('body')).not.toContainText('Private workspace')
  await expect(page.locator('body')).not.toContainText('Guest workspace')
  await expect(page.locator('body')).not.toContainText('Stored in SQLite on this computer')
  await expect(page.getByTestId('current-worth')).toHaveText('$0')
  await page.getByLabel('Starting cash', { exact: true }).fill('2500')
  await expect(page.getByTestId('current-worth')).toHaveText('$2,500')
  await expect(page.locator('.forecast-chart svg')).toBeVisible()
  expect(planRequests).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('public-homepage.png'), fullPage: true })
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to Worthwhile' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('sign-in.png'), fullPage: true })
  await page.getByRole('link', { name: 'Sign up', exact: true }).click()
  await expect(page).toHaveURL(/\/sign-up/)
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
})

test('continue without signing in opens an isolated editable guest plan', async ({ page, request }, testInfo) => {
  const planRequests: string[] = []
  const errors: string[] = []
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/plan') planRequests.push(request.method())
  })
  page.on('pageerror', error => errors.push(error.message))
  page.on('dialog', dialog => dialog.accept())
  await setupClerkTestingToken({ page })
  await page.goto('/sign-in')
  await page.getByRole('link', { name: 'Continue without signing in', exact: true }).click()
  await expect(page).toHaveURL(/\/guest$/)
  await expect(page.getByTestId('current-worth')).toHaveText('$0')
  await expect(page.getByRole('status')).toContainText('Changes are not saved')
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0)
  await page.getByLabel('Starting cash', { exact: true }).fill('2500')
  await page.getByRole('button', { name: 'Add income', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Guest income')
  await page.getByLabel('Amount (USD)', { exact: true }).fill('1000')
  await page.getByRole('dialog').getByRole('button', { name: 'Add income', exact: true }).click()
  await page.getByLabel('Selected forecast month').fill('1')
  await expect(page.getByTestId('current-worth')).toHaveText('$2,500')
  await expect(page.getByTestId('projected-worth')).toHaveText('$3,500')
  await expect(page.locator('.forecast-chart svg')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('guest-plan.png'), fullPage: true })
  await page.reload()
  await expect(page.getByTestId('current-worth')).toHaveText('$0')
  await expect(page.locator('.empty-ledger')).toBeVisible()
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/sign-in/)
  await page.goto('/guest')
  await expect(page.getByTestId('current-worth')).toHaveText('$0')
  expect(planRequests).toEqual([])
  expect(errors).toEqual([])
  expect((await request.get('/api/plan')).status()).toBe(401)
  expect((await request.put('/api/plan', { data: {} })).status()).toBe(401)
})

test('responsive financial workflows keep forms and actions reachable', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile'
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await setupClerkTestingToken({ page })
  const sizes = mobile ? [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 844, height: 390 }] : [page.viewportSize()!]
  for (const size of sizes) {
    await page.setViewportSize(size)
    await page.goto('/guest')
    await expect(page.getByTestId('current-worth')).toHaveText('$0')
    const cases = [
      { category: 'Income', singular: 'income', fields: { 'Amount (USD)': '1200' } },
      { category: 'Investments', singular: 'investment', fields: { 'Current value (USD)': '100', 'Annual ROI (%)': '5' } },
      { category: 'Expenses', singular: 'expense', fields: { 'Amount (USD)': '200' } },
      { category: 'Liabilities', singular: 'liability', fields: { 'Outstanding balance (USD)': '100', 'Interest APR (%)': '1', 'Monthly payment (USD)': '10' } },
    ]
    for (const entry of cases) {
      await page.getByRole('tab', { name: new RegExp(`^${entry.category}`) }).click()
      const trigger = page.getByRole('button', { name: `Add ${entry.singular}`, exact: true })
      await trigger.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      if (mobile) {
        await expect(dialog).toBeFocused()
        await page.evaluate(() => {
          Object.defineProperty(window.visualViewport!, 'height', { configurable: true, value: 260 })
          Object.defineProperty(window.visualViewport!, 'offsetTop', { configurable: true, value: 35 })
          window.visualViewport!.dispatchEvent(new Event('resize'))
        })
        await expect.poll(async () => {
          const bounds = await dialog.boundingBox()
          return !!bounds && bounds.y >= 35 && bounds.y + bounds.height <= 295
        }).toBe(true)
      } else {
        await expect(page.getByLabel('Name', { exact: true })).toBeFocused()
      }
      const name = `Example ${entry.singular} with a deliberately long descriptive name`
      await page.getByLabel('Name', { exact: true }).fill(name)
      for (const [label, value] of Object.entries(entry.fields)) await page.getByLabel(label, { exact: true }).fill(value!)
      if (entry.singular === 'investment') {
        await page.getByRole('tab', { name: '$ per month', exact: true }).click()
        await page.getByLabel('Monthly contribution (USD)', { exact: true }).fill('50')
      }
      const submit = dialog.getByRole('button', { name: `Add ${entry.singular}`, exact: true })
      await submit.scrollIntoViewIfNeeded()
      if (mobile) {
        const bounds = await submit.boundingBox()
        expect(bounds!.y).toBeGreaterThanOrEqual(35)
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(295)
        await page.screenshot({ path: testInfo.outputPath(`${size.width}-${entry.singular}-keyboard.png`) })
      }
      await submit.click()
      await expect(dialog).toHaveCount(0)
      if (mobile) {
        await page.evaluate(() => {
          Reflect.deleteProperty(window.visualViewport!, 'height')
          Reflect.deleteProperty(window.visualViewport!, 'offsetTop')
          window.visualViewport!.dispatchEvent(new Event('resize'))
        })
      }
      await expect(trigger).toBeFocused()
      const row = page.getByRole('row').filter({ hasText: name })
      await expect(row).toBeVisible()
      const edit = page.getByRole('button', { name: `Edit ${name}`, exact: true })
      if (mobile) {
        const bounds = await edit.boundingBox()
        expect(bounds!.width).toBeGreaterThanOrEqual(44)
        expect(bounds!.height).toBeGreaterThanOrEqual(44)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width)
        expect(await page.locator('.ledger-table').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      }
      await edit.click()
      await page.getByLabel('Name', { exact: true }).fill(`${name} edited`)
      await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
      await expect(row).toContainText(`${name} edited`)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      if (entry.singular === 'income') await page.screenshot({ path: testInfo.outputPath(`${size.width}-ledger.png`), fullPage: true })
      await page.getByRole('button', { name: `Delete ${name} edited`, exact: true }).click()
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(page.getByRole('alertdialog')).toHaveCount(0)
      await expect(row).toBeVisible()
      await page.getByRole('button', { name: `Delete ${name} edited`, exact: true }).click()
      await page.getByRole('button', { name: 'Delete entry', exact: true }).click()
      await expect(page.getByRole('alertdialog')).toHaveCount(0)
      await expect(page.locator('.empty-ledger')).toBeVisible()
    }
    await page.getByLabel('Selected forecast month').fill('12')
    await expect(page.locator('.month-selector label')).not.toHaveText('')
    await page.getByRole('tab', { name: 'Annual table', exact: true }).click()
    await expect(page.locator('.annual-table tbody tr').first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('tab', { name: 'Chart', exact: true }).click()
    await expect(page.locator('.forecast-chart svg')).toBeVisible()
  }
  expect(errors).toEqual([])
})

test('different signed-in accounts can save only their own plans', async ({ page, browser, baseURL }) => {
  test.skip(!process.env.E2E_CLERK_USER_EMAIL || !process.env.E2E_CLERK_OTHER_EMAIL, 'Requires two distinct development test accounts.')
  expect(process.env.E2E_CLERK_USER_EMAIL).not.toBe(process.env.E2E_CLERK_OTHER_EMAIL)
  await setupClerkTestingToken({ page })
  await page.goto('/sign-in')
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! })
  await page.goto('/')
  await expect(page.getByTestId('current-worth')).toBeVisible()
  const first = await (await page.request.get('/api/plan')).json()
  const firstPlan = { ...emptyPlan(), startingCash: 11100 }
  expect((await page.request.put('/api/plan', { data: { plan: firstPlan, revision: first.revision } })).ok()).toBe(true)
  const otherContext = await browser.newContext({ baseURL })
  try {
    const otherPage = await otherContext.newPage()
    await setupClerkTestingToken({ page: otherPage })
    await otherPage.goto('/sign-in')
    await clerk.signIn({ page: otherPage, emailAddress: process.env.E2E_CLERK_OTHER_EMAIL! })
    await otherPage.goto('/')
    await expect(otherPage.getByTestId('current-worth')).toBeVisible()
    const second = await (await otherPage.request.get('/api/plan')).json()
    const secondPlan = { ...emptyPlan(), startingCash: 22200 }
    expect((await otherPage.request.put('/api/plan', { data: { plan: secondPlan, revision: second.revision } })).ok()).toBe(true)
    await otherPage.reload()
    await expect(otherPage.getByTestId('current-worth')).toHaveText('$222')
    await page.reload()
    await expect(page.getByTestId('current-worth')).toHaveText('$111')
  } finally {
    await otherContext.close()
  }
})

test('a signed-in user can sign out without leaving financial data visible', async ({ page }) => {
  test.skip(!process.env.E2E_CLERK_USER_EMAIL, 'Requires a dedicated development test account.')
  await setupClerkTestingToken({ page })
  await page.goto('/sign-in')
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! })
  const response = await page.goto('/')
  expect(response?.headers()['cache-control']).toContain('no-store')
  await expect(page.getByTestId('current-worth')).toBeVisible()
  await page.getByRole('button', { name: 'Open user button' }).click()
  await page.getByText('Sign out', { exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByTestId('current-worth')).toHaveText('$0')
  await expect(page.getByRole('status')).toContainText('Changes are not saved')
  expect((await page.request.get('/api/plan')).status()).toBe(401)
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByTestId('current-worth')).toHaveText('$0')
})