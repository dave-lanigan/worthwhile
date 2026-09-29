import { describe, expect, it } from 'vitest'
import { emptyPlan, financialPlanSchema } from '../shared/schemas/financial-plan'
import { annualAmount, monthlyAmount, projectNetWorth, simulateNetWorth } from '../shared/utils/projection'
import { AGE_NET_WORTH_PERCENTILE_THRESHOLDS } from '../shared/utils/age-wealth-percentile-thresholds'
import { ageGroupNetWorthPercentile, ageOnDate, NET_WORTH_PERCENTILE_THRESHOLDS, netWorthPercentile, percentileLabel, wealthAgeBand } from '../shared/utils/wealth-percentile'

describe('net worth projections', () => {
  it('starts empty, includes today, and never mutates the input', () => {
    const plan = emptyPlan()
    const snapshot = JSON.stringify(plan)
    expect(projectNetWorth(plan).points).toHaveLength(121)
    expect(projectNetWorth(plan).points.every(point => point.netWorth === 0)).toBe(true)
    expect(JSON.stringify(plan)).toBe(snapshot)
  })

  it('uses effective annual returns, including zero and negative returns', () => {
    for (const rate of [0, 12, -20, -100]) {
      const plan = { ...emptyPlan(), years: 1, investments: [{ id: 'fund', name: 'Fund', balance: 10000, annualRoi: rate }] }
      expect(Math.abs(projectNetWorth(plan).points[12]!.netWorth - 10000 * (1 + rate / 100))).toBeLessThanOrEqual(6)
    }
  })

  it('allocates surplus equally without losing cents or sweeping starting cash', () => {
    const plan = emptyPlan()
    plan.startingCash = 500
    plan.incomes = [{ id: 'salary', name: 'Salary', amount: 100000, frequency: 'monthly' }]
    plan.expenses = [{ id: 'expense', name: 'Expense', amount: 20000, frequency: 'monthly' }]
    plan.investments = ['c', 'b', 'a'].map(id => ({ id, name: id, balance: 0, annualRoi: 0 }))
    const point = projectNetWorth(plan).points[1]!
    expect(point).toMatchObject({ cash: 500, invested: 80000, netWorth: 80500, contributions: 80000 })
    expect(point.investmentBalances).toEqual({ a: 26667, b: 26667, c: 26666 })
    plan.investments = []
    expect(projectNetWorth(plan).points[1]!.cash).toBe(80500)
  })

  it('does not change net worth when repaying principal, and caps final payments', () => {
    const plan = emptyPlan()
    plan.startingCash = 200000
    plan.liabilities = [{ id: 'loan', name: 'Loan', balance: 115000, apr: 0, payment: 10000 }]
    const { points } = projectNetWorth(plan)
    expect(points[0]!.netWorth).toBe(85000)
    expect(points[11]!.debt).toBe(5000)
    expect(points[12]).toMatchObject({ debt: 0, payments: 5000, netWorth: 85000 })
    expect(points[13]).toMatchObject({ payments: 0, netWorth: 85000 })
  })

  it('uses adjustable allocations and retains unallocated surplus in cash', () => {
    const plan = emptyPlan()
    plan.incomes = [{ id: 'pay', name: 'Pay', amount: 100001, frequency: 'monthly' }]
    plan.investments = [
      { id: 'first', name: 'First', balance: 0, annualRoi: 0, allocation: 60 },
      { id: 'second', name: 'Second', balance: 0, annualRoi: 0, allocation: 25 },
      { id: 'third', name: 'Third', balance: 100, annualRoi: 0, allocation: 0 },
    ]
    const point = projectNetWorth(plan).points[1]!
    expect(point).toMatchObject({ cash: 15000, contributions: 85001, netWorth: 100101 })
    expect(point.investmentBalances).toEqual({ first: 60001, second: 25000, third: 100 })
    plan.investments[0]!.allocation = 75
    expect(projectNetWorth(plan).points[1]).toMatchObject({ cash: 0, contributions: 100001 })
    plan.investments[0]!.allocation = 76
    expect(financialPlanSchema.safeParse(plan).success).toBe(false)
  })

  it('preserves legacy equal allocations and supports zero allocations', () => {
    const plan = emptyPlan()
    plan.incomes = [{ id: 'pay', name: 'Pay', amount: 1, frequency: 'monthly' }]
    plan.investments = ['a', 'b', 'c'].map(id => ({ id, name: id, balance: 0, annualRoi: 0 }))
    expect(projectNetWorth(plan).points[1]!.investmentBalances).toEqual({ a: 1, b: 0, c: 0 })
    plan.investments.forEach(item => { item.allocation = 0 })
    expect(projectNetWorth(plan).points[1]).toMatchObject({ cash: 1, contributions: 0 })
  })

  it('funds monthly dollar targets before percentages of the remaining surplus', () => {
    const plan = emptyPlan()
    plan.incomes = [{ id: 'pay', name: 'Pay', amount: 100000, frequency: 'monthly' }]
    plan.expenses = [{ id: 'rent', name: 'Rent', amount: 10000, frequency: 'monthly' }]
    plan.investments = [
      { id: 'hsa', name: 'HSA', balance: 0, annualRoi: 0, monthlyContribution: 25000 },
      { id: 'retirement', name: '401k', balance: 0, annualRoi: 0, monthlyContribution: 40000 },
      { id: 'fund', name: 'Fund', balance: 0, annualRoi: 0, allocation: 50 },
    ]
    expect(projectNetWorth(plan).points[1]).toMatchObject({ cash: 12500, invested: 77500, contributions: 77500, netWorth: 90000, investmentBalances: { hsa: 25000, retirement: 40000, fund: 12500 } })
    plan.investments[2]!.allocation = 100
    expect(projectNetWorth(plan).points[1]).toMatchObject({ cash: 0, contributions: 90000, investmentBalances: { fund: 25000 } })
    plan.investments.pop()
    expect(projectNetWorth(plan).points[1]).toMatchObject({ cash: 25000, contributions: 65000 })
  })

  it('prorates underfunded dollar targets without sweeping cash or losing cents', () => {
    const plan = emptyPlan()
    plan.startingCash = 50000
    plan.incomes = [{ id: 'pay', name: 'Pay', amount: 10001, frequency: 'monthly' }]
    plan.investments = [
      { id: 'first', name: 'First', balance: 0, annualRoi: 0, monthlyContribution: 20000 },
      { id: 'second', name: 'Second', balance: 0, annualRoi: 0, monthlyContribution: 10000 },
      { id: 'fund', name: 'Fund', balance: 0, annualRoi: 0, allocation: 100 },
    ]
    expect(projectNetWorth(plan).points[1]).toMatchObject({ cash: 50000, netWorth: 60001, contributions: 10001, investmentBalances: { first: 6667, second: 3334, fund: 0 } })
    plan.startingCash = 0
    plan.incomes[0]!.amount = 10000
    plan.liabilities = [{ id: 'loan', name: 'Loan', balance: 15000, apr: 0, payment: 15000 }]
    const { points } = projectNetWorth(plan)
    expect(points[1]).toMatchObject({ cash: -5000, contributions: 0 })
    expect(points[2]).toMatchObject({ cash: 0, contributions: 5000, investmentBalances: { first: 3333, second: 1667, fund: 0 } })
  })

  it('handles zero dollar targets and legacy percentages and validates contribution modes', () => {
    const plan = emptyPlan()
    plan.incomes = [{ id: 'pay', name: 'Pay', amount: 1, frequency: 'monthly' }]
    plan.investments = [
      { id: 'fixed', name: 'Fixed', balance: 0, annualRoi: 0, monthlyContribution: 0 },
      { id: 'a', name: 'A', balance: 0, annualRoi: 0 },
      { id: 'b', name: 'B', balance: 0, annualRoi: 0 },
    ]
    expect(projectNetWorth(plan).points[1]!.investmentBalances).toEqual({ a: 1, b: 0, fixed: 0 })
    for (const amount of [-1, 0.5, Infinity]) {
      plan.investments[0]!.monthlyContribution = amount
      expect(financialPlanSchema.safeParse(plan).success).toBe(false)
    }
    plan.investments[0]!.monthlyContribution = 0
    plan.investments[0]!.allocation = 0
    expect(financialPlanSchema.safeParse(plan).success).toBe(false)
  })

  it('normalizes tiny percentage rounding excess without creating money', () => {
    const plan = emptyPlan()
    plan.years = 1
    plan.incomes = [{ id: 'pay', name: 'Pay', amount: 100000000000000, frequency: 'monthly' }]
    plan.investments = [
      { id: 'a', name: 'A', balance: 0, annualRoi: 0, allocation: 50.000000001 },
      { id: 'b', name: 'B', balance: 0, annualRoi: 0, allocation: 50 },
    ]
    const point = projectNetWorth(plan).points[1]!
    expect(point.cash + point.invested).toBe(100000000000000)
    expect(point.invested).toBe(point.contributions)
  })

  it('charges debt interest and warns about negative amortization', () => {
    const plan = emptyPlan()
    plan.liabilities = [{ id: 'loan', name: 'Loan', balance: 120000, apr: 12, payment: 100 }]
    const result = projectNetWorth(plan)
    expect(result.points[1]).toMatchObject({ debt: 121100, cash: -100, netWorth: -121200 })
    expect(result.growingDebts).toEqual(['loan'])
    expect(result.firstShortfall).toBe(1)
  })

  it('covers a cash deficit before resuming investment contributions', () => {
    const plan = emptyPlan()
    plan.incomes = [{ id: 'pay', name: 'Pay', amount: 10000, frequency: 'monthly' }]
    plan.liabilities = [{ id: 'loan', name: 'Loan', balance: 15000, apr: 0, payment: 15000 }]
    plan.investments = [{ id: 'fund', name: 'Fund', balance: 0, annualRoi: 12 }]
    const { points } = projectNetWorth(plan)
    expect(points[1]).toMatchObject({ cash: -5000, contributions: 0 })
    expect(points[2]).toMatchObject({ cash: 0, contributions: 5000, invested: 5000 })
    expect(points[3]!.invested).toBeGreaterThan(15000)
  })

  it('normalizes annual flows and rejects invalid or overflowing forecasts', () => {
    expect(monthlyAmount({ id: 'annual', name: 'Annual', amount: 120000, frequency: 'annual' })).toBe(10000)
    expect(annualAmount({ id: 'annual', name: 'Annual', amount: 10001, frequency: 'annual' })).toBe(10001)
    expect(annualAmount({ id: 'monthly', name: 'Monthly', amount: 10001, frequency: 'monthly' })).toBe(120012)
    expect(financialPlanSchema.safeParse({ ...emptyPlan(), startingCash: -1 }).success).toBe(false)
    expect(financialPlanSchema.safeParse({ ...emptyPlan(), startingCash: Infinity }).success).toBe(false)
    expect(() => projectNetWorth({ ...emptyPlan(), years: 40, investments: [{ id: 'fund', name: 'Fund', balance: 100000000, annualRoi: 1000 }] })).toThrow('exceeds')
  })

  it('collapses every Monte Carlo percentile to the mean-return path at zero volatility', () => {
    const plan = { ...emptyPlan(), years: 1, investments: [{ id: 'fund', name: 'Fund', balance: 100000, annualRoi: 0 }] }
    const simulation = simulateNetWorth(plan, { annualReturn: 12, annualVolatility: 0, runs: 100, target: 110000 })
    expect(simulation.points[12]).toMatchObject({ p10: 112000, p25: 112000, p50: 112000, p75: 112000, p90: 112000 })
    expect(simulation.probability).toBe(1)
  })
})

describe('U.S. household wealth benchmarks', () => {
  it('matches all published-extract percentile thresholds in dollars using cents as input', () => {
    expect(NET_WORTH_PERCENTILE_THRESHOLDS).toHaveLength(99)
    NET_WORTH_PERCENTILE_THRESHOLDS.forEach((dollars, index) => {
      expect(netWorthPercentile(dollars * 100)).toBe(index + 1)
      if (index) expect(dollars).toBeGreaterThan(NET_WORTH_PERCENTILE_THRESHOLDS[index - 1]!)
    })
    expect(netWorthPercentile(19270000)).toBe(50)
    expect(netWorthPercentile(193690000)).toBe(90)
    expect(netWorthPercentile(1361540000)).toBe(99)
  })

  it('interpolates within the survey and bounds tails without treating zero wealth as zero percentile', () => {
    expect(netWorthPercentile((192700 + 201830) * 50)).toBe(50.5)
    expect(netWorthPercentile(0)).toBeGreaterThan(7)
    expect(netWorthPercentile(-8000000)).toBe(0)
    expect(netWorthPercentile(2000000000)).toBe(100)
    for (const invalid of [NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) expect(netWorthPercentile(invalid)).toBeNull()
  })

  it('formats rounded estimates, tails, and unavailable results clearly', () => {
    expect(percentileLabel(50)).toBe('Approx. 50th percentile')
    expect(percentileLabel(21)).toBe('Approx. 21st percentile')
    expect(percentileLabel(22)).toBe('Approx. 22nd percentile')
    expect(percentileLabel(23)).toBe('Approx. 23rd percentile')
    expect(percentileLabel(11)).toBe('Approx. 11th percentile')
    expect(percentileLabel(0)).toBe('Below 1st percentile')
    expect(percentileLabel(100)).toBe('Above 99th percentile')
    expect(percentileLabel(null)).toBe('--')
  })

  it('derives weighted thresholds for every selected age band', () => {
    Object.values(AGE_NET_WORTH_PERCENTILE_THRESHOLDS).forEach(thresholds => {
      expect(thresholds).toHaveLength(99)
      thresholds.forEach((dollars, index) => {
        if (index) expect(dollars).toBeGreaterThan(thresholds[index - 1]!)
      })
    })
    expect(AGE_NET_WORTH_PERCENTILE_THRESHOLDS.under35[49]).toBe(39040)
    expect(AGE_NET_WORTH_PERCENTILE_THRESHOLDS.ages35to44[49]).toBe(135300)
    expect(AGE_NET_WORTH_PERCENTILE_THRESHOLDS.ages75plus[49]).toBe(334700)
  })

  it('uses the age at the comparison date and never guesses an invalid birth date', () => {
    expect(ageOnDate('1990-09-30', new Date('2026-09-29T00:00:00Z'))).toBe(35)
    expect(ageOnDate('1990-09-30', new Date('2026-09-30T00:00:00Z'))).toBe(36)
    expect(ageOnDate('2027-01-01', new Date('2026-01-01T00:00:00Z'))).toBeNull()
    expect(ageOnDate('1990-02-30', new Date('2026-01-01T00:00:00Z'))).toBeNull()
    expect(wealthAgeBand(34)).toBe('under35')
    expect(wealthAgeBand(35)).toBe('ages35to44')
    expect(wealthAgeBand(75)).toBe('ages75plus')
    expect(ageGroupNetWorthPercentile(3904000, '2000-01-01', new Date('2026-01-01T00:00:00Z'))).toEqual({ band: 'under35', percentile: 50 })
    expect(ageGroupNetWorthPercentile(3904000, '', new Date('2026-01-01T00:00:00Z'))).toBeNull()
  })
})
