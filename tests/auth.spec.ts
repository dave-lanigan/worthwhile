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