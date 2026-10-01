import { describe, expect, it } from 'vitest'
import { liabilitySchema } from '../shared/schemas/financial-plan'
import { monthlyLoanPayment } from '../shared/utils/loan'
import { projectNetWorth } from '../shared/utils/projection'
import { emptyPlan } from '../shared/schemas/financial-plan'

describe('amortized loans', () => {
  it('computes the monthly payment for interest-bearing and zero-interest loans', () => {
    expect(monthlyLoanPayment(12000000, 6, 360)).toBe(71947)
    expect(monthlyLoanPayment(120000, 0, 12)).toBe(10000)
    expect(monthlyLoanPayment(100, 0, 3)).toBe(34)
    expect(monthlyLoanPayment(0, 5, 12)).toBe(0)
  })

  it('rejects invalid terms and persists valid loan details for editing', () => {
    expect(Number.isNaN(monthlyLoanPayment(10000, 5, 0))).toBe(true)
    expect(liabilitySchema.safeParse({ id: 'a', name: 'Loan', balance: 10000, apr: 5, payment: 100, type: 'loan' }).success).toBe(false)
    const loan = liabilitySchema.parse({ id: 'a', name: 'Loan', balance: 120000, apr: 0, termMonths: 12, payment: monthlyLoanPayment(120000, 0, 12), type: 'loan' })
    const plan = emptyPlan()
    plan.liabilities = [loan]
    expect(projectNetWorth(plan).points[12]!.debt).toBe(0)
  })
})
