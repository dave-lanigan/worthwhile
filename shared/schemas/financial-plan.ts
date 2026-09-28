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

export const taxFilingStatusSchema = z.enum(['single', 'married-jointly', 'married-separately', 'head-of-household'])
const birthDateSchema = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')])
export const userProfileSchema = z.object({
  birthDate: birthDateSchema,
  address: z.string().trim().min(1).max(160),
  taxFilingStatus: taxFilingStatusSchema,
})
export const savedUserProfileSchema = z.object({ profile: userProfileSchema, revision: z.number().int().nonnegative() })
export type UserProfile = z.infer<typeof userProfileSchema>
export type SavedUserProfile = z.infer<typeof savedUserProfileSchema>

export function emptyUserProfile(): UserProfile {
  return { birthDate: '', address: '', taxFilingStatus: 'single' }
}

export function exampleUserProfile(): UserProfile {
  return { birthDate: '1994-01-01', address: '123 Example Street, Austin, TX 78701', taxFilingStatus: 'single' }
}

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

export function examplePlan(): FinancialPlan {
  return {
    startingCash: 825000,
    years: 10,
    incomes: [
      { id: 'example-salary', name: 'Jim Doe salary', amount: 780000, frequency: 'annual' },
      { id: 'example-freelance', name: 'Jim Doe freelance work', amount: 65000, frequency: 'annual' },
    ],
    investments: [
      { id: 'example-retirement', name: 'Jim Doe retirement account', balance: 1840000, annualRoi: 7, allocation: 70 },
      { id: 'example-brokerage', name: 'Jim Doe brokerage account', balance: 665000, annualRoi: 6, allocation: 30 },
    ],
    expenses: [
      { id: 'example-living', name: 'Jim Doe living costs', amount: 365000, frequency: 'annual' },
      { id: 'example-travel', name: 'Jim Doe travel fund', amount: 24000, frequency: 'annual' },
    ],
    liabilities: [
      { id: 'example-student-loan', name: 'Jim Doe student loan', balance: 210000, apr: 4.5, payment: 18000 },
    ],
  }
}
