import { describe, expect, it } from 'vitest'
import { emptyPlan, financialPlanSchema, type RealEstate } from '../shared/schemas/financial-plan'
import { linkedAssetLoans } from '../shared/utils/asset-loans'
import { projectNetWorth } from '../shared/utils/projection'

describe('linked asset debt rows', () => {
  it('exposes the persisted details and association, following asset renames and removal', () => {
    const assets: RealEstate[] = [
      { id: 'car', name: 'Family car', assetType: 'car', value: 1200000, annualAppreciation: -15, loan: { balance: 600000, apr: 0, termMonths: 12, payment: 50000 } },
      { id: 'home', name: 'Home', value: 30000000, annualAppreciation: 3 },
    ]
    expect(linkedAssetLoans(assets)).toEqual([{ id: 'car', assetId: 'car', name: 'Family car loan', type: 'loan', balance: 600000, apr: 0, termMonths: 12, payment: 50000 }])
    assets[0]!.name = 'Renamed car'
    assets[0]!.loan!.balance = 300000
    expect(linkedAssetLoans(assets)).toHaveLength(1)
    expect(linkedAssetLoans(assets)[0]).toMatchObject({ name: 'Renamed car loan', balance: 300000 })
    delete assets[0]!.loan
    expect(linkedAssetLoans(assets)).toEqual([])
    expect(assets).toHaveLength(2)
    expect(linkedAssetLoans([])).toEqual([])
  })

  it('does not persist duplicate liabilities or double count home/car debt and payments', () => {
    const plan = emptyPlan()
    plan.realEstate = [
      { id: 'car', name: 'Car', assetType: 'car', value: 1200000, annualAppreciation: 0, loan: { balance: 600000, apr: 0, termMonths: 12, payment: 50000 } },
      { id: 'home', name: 'Home', value: 2000000, annualAppreciation: 0, loan: { balance: 1200000, apr: 0, termMonths: 12, payment: 100000 } },
    ]
    plan.liabilities = [{ id: 'other', name: 'Other debt', balance: 120000, apr: 0, payment: 10000 }]
    const before = projectNetWorth(plan)
    const rows = [...plan.liabilities, ...linkedAssetLoans(plan.realEstate)]
    expect(rows).toHaveLength(3)
    expect(rows.reduce((sum, row) => sum + row.balance, 0)).toBe(1920000)
    expect(rows.reduce((sum, row) => sum + row.payment, 0)).toBe(160000)
    expect(financialPlanSchema.parse(plan).liabilities).toHaveLength(1)
    expect(projectNetWorth(plan)).toEqual(before)
    expect(before.points[0]).toMatchObject({ debt: 1920000, netWorth: 1280000 })
    expect(before.points[1]!.payments).toBe(160000)
  })
})
