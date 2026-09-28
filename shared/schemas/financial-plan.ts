import { z } from 'zod'

const money = z.number().int().min(0).max(100_000_000_000_000)
const entry = z.object({ id: z.string().min(1).max(100), name: z.string().trim().min(1).max(100) })
export const cashFlowSchema = entry.extend({ amount: money, frequency: z.enum(['monthly', 'annual']) })
export const investmentSchema = entry.extend({ balance: money, annualRoi: z.number().min(-100).max(1000), allocation: z.number().min(0).max(100).optional(), monthlyContribution: money.optional() }).refine(item => item.allocation === undefined || item.monthlyContribution === undefined, { message: 'Choose a percentage or a monthly amount, not both.' })
export const liabilitySchema = entry.extend({ balance: money, apr: z.number().min(0).max(1000), payment: money })

export const financialPlanSchema = z.object({
  startingCash: money,
  years: z.number().int().min(1).max(40),
  incomes: z.array(cashFlowSchema).max(100),
  investments: z.array(investmentSchema).max(100),
  expenses: z.array(cashFlowSchema).max(100),
  liabilities: z.array(liabilitySchema).max(100),
}).superRefine((plan, context) => {
  const ids = [...plan.incomes, ...plan.investments, ...plan.expenses, ...plan.liabilities].map(item => item.id)
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'Entry IDs must be unique.' })
  if (plan.investments.reduce((total, item) => total + (item.allocation ?? 0), 0) > 100 + 1e-8) {
    context.addIssue({ code: 'custom', path: ['investments'], message: 'Investment allocations cannot exceed 100% of surplus.' })
  }
})

export const savePlanSchema = z.object({ plan: financialPlanSchema, revision: z.number().int().nonnegative() })
export type FinancialPlan = z.infer<typeof financialPlanSchema>
export type CashFlow = z.infer<typeof cashFlowSchema>
export type Investment = z.infer<typeof investmentSchema>
export type Liability = z.infer<typeof liabilitySchema>
export type SavedPlan = { plan: FinancialPlan; revision: number }
export type Category = 'incomes' | 'investments' | 'expenses' | 'liabilities'

export function investmentAllocation(investment: Investment, investments: Investment[]): number {
  if (investment.monthlyContribution !== undefined) return 0
  if (investment.allocation !== undefined) return investment.allocation
  const assigned = investments.reduce((total, item) => total + (item.allocation ?? 0), 0)
  const unassigned = investments.filter(item => item.allocation === undefined && item.monthlyContribution === undefined).length
  return unassigned ? Math.max(0, 100 - assigned) / unassigned : 0
}

export function emptyPlan(): FinancialPlan {
  return { startingCash: 0, years: 10, incomes: [], investments: [], expenses: [], liabilities: [] }
}