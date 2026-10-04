import { describe, expect, it } from 'vitest'
import { liabilitySchema } from '../shared/schemas/financial-plan'
import { loanDetailsError, monthlyLoanPayment } from '../shared/utils/loan'
import { projectNetWorth } from '../shared/utils/projection'
import { emptyPlan } from '../shared/schemas/financial-plan'

describe('amortized loans', () => {
  it.each([
    [0, 1], [0, 5], [6, 1], [6, 5],
    ['0', '1'], ['6', '5'], [0, '5'], ['6', 1],
    [0, 1 / 12], [6, 40],
  ])('accepts APR %s and duration %s from numeric or string inputs', (apr, years) => {
    expect(loanDetailsError(apr, years)).toBe('')
  })

  it.each(['', ' ', NaN, Infinity, -1, 1001, 'NaN', 'Infinity', '-1'])('rejects invalid APR %s', (apr) => {
    expect(loanDetailsError(apr, 5)).toBe('Enter the loan APR (0 for an interest-free loan).')
  })

  it.each(['', ' ', NaN, Infinity, -1, 0, 1 / 24, 41, 'NaN', 'Infinity', '0.01', '41'])('rejects invalid duration %s', (years) => {
    expect(loanDetailsError(0, years)).toBe('Enter the remaining loan duration, from 1 month to 40 years.')
  })

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
    plan.years = 30
    plan.liabilities = [{ ...loan, balance: 12000000, apr: 6, termMonths: 360, payment: monthlyLoanPayment(12000000, 6, 360) }]
    expect(projectNetWorth(plan).points[360]!.debt).toBe(0)
  })
})
