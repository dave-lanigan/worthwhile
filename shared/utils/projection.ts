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
  return flow.frequency === 'annual' ? Math.round(flow.amount / 12) : flow.amount
}

export function annualAmount(flow: CashFlow): number {
  return flow.frequency === 'annual' ? flow.amount : flow.amount * 12
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