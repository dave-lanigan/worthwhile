import { describe, expect, it } from 'vitest'
import { emptyPlan, financialPlanSchema, realEstateSchema } from '../shared/schemas/financial-plan'
import { monthlyLoanPayment } from '../shared/utils/loan'
import { projectNetWorth, simulateNetWorth } from '../shared/utils/projection'

describe('real estate with a linked loan', () => {
  it('counts equity (value minus outstanding loan) toward net worth today', () => {
    const plan = emptyPlan()
    plan.realEstate = [{ id: 'home', name: 'Home', value: 50000000, annualAppreciation: 0, loan: { balance: 30000000, apr: 6, termMonths: 360, payment: monthlyLoanPayment(30000000, 6, 360) } }]
    const today = projectNetWorth(plan).points[0]!
    expect(today.property).toBe(50000000)
    expect(today.propertyDebt).toBe(30000000)
    expect(today.debt).toBe(30000000)
    expect(today.netWorth).toBe(20000000)
  })

  it('increases equity as the loan is repaid and stops payments at payoff', () => {
    const plan = emptyPlan()
    plan.years = 2
    plan.startingCash = 1200000
    plan.realEstate = [{ id: 'home', name: 'Home', value: 2000000, annualAppreciation: 0, loan: { balance: 1200000, apr: 0, termMonths: 12, payment: monthlyLoanPayment(1200000, 0, 12) } }]
    const { points } = projectNetWorth(plan)
    const equity = (month: number) => points[month]!.property - points[month]!.propertyDebt
    expect(equity(0)).toBe(800000)
    expect(equity(6)).toBe(1400000)
    expect(equity(12)).toBe(2000000)
    expect(points[12]!.cash).toBe(0)
    expect(points[13]!.payments).toBe(0)
    expect(points[24]!.netWorth).toBe(2000000)
  })

  it('appreciates the property value monthly and fully amortizes an interest-bearing loan', () => {
    const plan = emptyPlan()
    plan.years = 30
    plan.realEstate = [{ id: 'home', name: 'Home', value: 40000000, annualAppreciation: 3, loan: { balance: 30000000, apr: 6, termMonths: 360, payment: monthlyLoanPayment(30000000, 6, 360) } }]
    const { points } = projectNetWorth(plan)
    expect(points[12]!.property).toBeCloseTo(41200000, -2)
    expect(points[360]!.propertyDebt).toBe(0)
    expect(points[1]!.payments).toBe(monthlyLoanPayment(30000000, 6, 360))
  })

  it('treats properties without a loan as fully owned', () => {
    const plan = emptyPlan()
    plan.realEstate = [realEstateSchema.parse({ id: 'cabin', name: 'Cabin', value: 10000000, annualAppreciation: 2 })]
    const { points } = projectNetWorth(plan)
    expect(points[0]!.netWorth).toBe(10000000)
    expect(points[1]!.payments).toBe(0)
  })

  it('keeps property value in Monte Carlo paths', () => {
    const plan = emptyPlan()
    plan.realEstate = [{ id: 'home', name: 'Home', value: 10000000, annualAppreciation: 0 }]
    const simulation = simulateNetWorth(plan, { annualReturn: 5, annualVolatility: 10, runs: 10, random: () => 0.5 })
    expect(simulation.points.at(-1)!.p50).toBe(10000000)
  })

  it('accepts saved plans created before real estate existed', () => {
    const { realEstate: _, ...legacy } = emptyPlan()
    expect(financialPlanSchema.parse(legacy).realEstate).toEqual([])
  })

  it('requires a valid loan term for the linked loan', () => {
    expect(realEstateSchema.safeParse({ id: 'h', name: 'Home', value: 100, annualAppreciation: 0, loan: { balance: 100, apr: 5, payment: 10 } }).success).toBe(false)
  })
})
