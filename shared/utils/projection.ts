import { financialPlanSchema, investmentAllocation, type CashFlow, type FinancialPlan } from '../schemas/financial-plan'

export type ProjectionPoint = {
  month: number
  cash: number
  invested: number
  assets: number
  debt: number
  netWorth: number
  payments: number
  contributions: number
  investmentBalances: Record<string, number>
  debtBalances: Record<string, number>
}

export function monthlyAmount(flow: CashFlow): number {
  if (flow.frequency === 'annual') return Math.round(flow.amount / 12)
  if (flow.frequency === 'biweekly') return Math.round((flow.amount * 26) / 12)
  return flow.amount
}

export function annualAmount(flow: CashFlow): number {
  if (flow.frequency === 'annual') return flow.amount
  return flow.amount * (flow.frequency === 'biweekly' ? 26 : 12)
}

function checked(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error('This forecast exceeds the supported amount. Reduce the balances, return rates, or time horizon.')
  return value
}

function allocateContributions(available: number, denominator: number, shares: { id: string; weight: number }[]) {
  const allocations = shares.map(item => {
    const exact = available * (item.weight / denominator)
    return { id: item.id, cents: Math.floor(exact), fraction: exact - Math.floor(exact) }
  })
  const totalWeight = shares.reduce((total, item) => total + item.weight, 0)
  const contribution = Math.round(available * Math.min(totalWeight / denominator, 1))
  const remainder = contribution - allocations.reduce((total, item) => total + item.cents, 0)
  allocations.sort((first, second) => second.fraction - first.fraction || first.id.localeCompare(second.id))
  return allocations.map((item, index) => ({ id: item.id, cents: item.cents + (index < remainder ? 1 : 0) }))
}

export function projectNetWorth(input: FinancialPlan) {
  const plan = financialPlanSchema.parse(input)
  const income = checked(plan.incomes.reduce((total, item) => total + monthlyAmount(item), 0))
  const expenses = checked(plan.expenses.reduce((total, item) => total + monthlyAmount(item), 0))
  const investments = plan.investments.toSorted((first, second) => first.id.localeCompare(second.id))
  const totalAllocation = investments.reduce((total, item) => total + investmentAllocation(item, investments), 0)
  const fixedShares = investments.filter(item => item.monthlyContribution !== undefined).map(item => ({ id: item.id, weight: item.monthlyContribution! }))
  const fixedTotal = checked(fixedShares.reduce((total, item) => total + item.weight, 0))
  const percentageShares = investments.filter(item => item.monthlyContribution === undefined).map(item => ({ id: item.id, weight: investmentAllocation(item, investments) }))
  const investmentBalances = Object.fromEntries(investments.map(item => [item.id, item.balance]))
  const debtBalances = Object.fromEntries(plan.liabilities.map(item => [item.id, item.balance]))
  const factors = Object.fromEntries(investments.map(item => [item.id, (1 + item.annualRoi / 100) ** (1 / 12)]))
  const growingDebts = new Set<string>()
  const points: ProjectionPoint[] = []
  let cash = plan.startingCash
  let firstShortfall: number | null = null

  for (let month = 0; month <= plan.years * 12; month++) {
    let payments = 0
    let contributions = 0
    if (month > 0) {
      for (const item of investments) investmentBalances[item.id] = checked(Math.round(investmentBalances[item.id]! * factors[item.id]!))
      for (const item of plan.liabilities) {
        const opening = debtBalances[item.id]!
        const interest = checked(Math.round(opening * item.apr / 100 / 12))
        const payment = Math.min(item.payment, checked(opening + interest))
        debtBalances[item.id] = checked(opening + interest - payment)
        payments = checked(payments + payment)
        if (interest > payment) growingDebts.add(item.id)
      }
      const surplus = checked(income - expenses - payments)
      cash = checked(cash + surplus)
      if (cash < 0 && firstShortfall === null) firstShortfall = month
      if (investments.length && surplus > 0 && cash > 0) {
        const available = Math.min(surplus, cash)
        const fixedBudget = Math.min(available, fixedTotal)
        const allocations = [
          ...allocateContributions(fixedBudget, Math.max(1, fixedTotal), fixedShares),
          ...allocateContributions(available - fixedBudget, Math.max(100, totalAllocation), percentageShares),
        ]
        for (const item of allocations) {
          investmentBalances[item.id] = checked(investmentBalances[item.id]! + item.cents)
          contributions = checked(contributions + item.cents)
        }
        cash -= contributions
      }
    }
    const invested = checked(Object.values(investmentBalances).reduce((total, balance) => total + balance, 0))
    const debt = checked(Object.values(debtBalances).reduce((total, balance) => total + balance, 0))
    const assets = checked(cash + invested)
    points.push({ month, cash, invested, assets, debt, netWorth: checked(assets - debt), payments, contributions, investmentBalances: { ...investmentBalances }, debtBalances: { ...debtBalances } })
  }

  return { points, income, expenses, firstShortfall, growingDebts: [...growingDebts] }
}

export type Projection = ReturnType<typeof projectNetWorth>

export type MonteCarloOptions = {
  annualReturn: number
  annualVolatility: number
  target?: number
  runs?: number
  random?: () => number
}

export type MonteCarloPoint = {
  month: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
}

function percentile(values: number[], value: number): number {
  return values[Math.round((values.length - 1) * value)]!
}

function standardNormal(random: () => number): number {
  let first = random()
  let second = random()
  while (first === 0) first = random()
  while (second === 0) second = random()
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second)
}

export function simulateNetWorth(input: FinancialPlan, options: MonteCarloOptions) {
  const plan = financialPlanSchema.parse(input)
  const runs = options.runs ?? 5000
  const target = options.target ?? 100_000_000
  if (!Number.isInteger(runs) || runs < 1 || runs > 100_000) throw new Error('Choose between 1 and 100,000 simulation runs.')
  if (!Number.isSafeInteger(target) || target < 0) throw new Error('Choose a valid target amount.')
  if (!Number.isFinite(options.annualReturn) || !Number.isFinite(options.annualVolatility) || options.annualVolatility < 0) throw new Error('Choose valid return assumptions.')

  const deterministic = projectNetWorth(plan)
  const months = deterministic.points.length
  const values = Array.from({ length: months }, () => new Array<number>(runs))
  const annualReturn = options.annualReturn / 100
  const annualVolatility = options.annualVolatility / 100
  const monthlyVolatility = annualVolatility / Math.sqrt(12)
  const monthlyDrift = Math.log1p(annualReturn) / 12 - monthlyVolatility ** 2 / 2
  const random = options.random ?? Math.random

  for (let run = 0; run < runs; run++) {
    let invested = deterministic.points[0]!.invested
    values[0]![run] = deterministic.points[0]!.netWorth
    for (let month = 1; month < months; month++) {
      const point = deterministic.points[month]!
      const factor = Math.exp(monthlyDrift + monthlyVolatility * standardNormal(random))
      invested = checked(Math.round(invested * factor + point.contributions))
      values[month]![run] = checked(point.cash - point.debt + invested)
    }
  }

  const points = values.map((runValues, month) => {
    runValues.sort((first, second) => first - second)
    return {
      month,
      p10: percentile(runValues, 0.1),
      p25: percentile(runValues, 0.25),
      p50: percentile(runValues, 0.5),
      p75: percentile(runValues, 0.75),
      p90: percentile(runValues, 0.9),
    }
  })
  const finalValues = values[months - 1]!
  const probability = finalValues.filter(value => value >= target).length / runs

  return { points, probability, target, runs }
}