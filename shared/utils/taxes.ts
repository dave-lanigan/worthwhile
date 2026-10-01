import type { UserProfile } from '../schemas/financial-plan'

export const TAX_YEAR = 2026
type FilingStatus = UserProfile['taxFilingStatus']
export type TaxInputs = { status: FilingStatus; state: string; deductions: string; exemptions: string }
const federal: Record<FilingStatus, { deduction: number; thresholds: number[] }> = {
  single: { deduction: 16100, thresholds: [12400, 50400, 105700, 201775, 256225, 640600] },
  'married-jointly': { deduction: 32200, thresholds: [24800, 100800, 211400, 403550, 512450, 768700] },
  'married-separately': { deduction: 16100, thresholds: [12400, 50400, 105700, 201775, 256225, 384350] },
  'head-of-household': { deduction: 24150, thresholds: [18650, 71350, 134700, 216800, 288000, 600250] },
}
const rates = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37]

// Simplified state-rate estimates, not state-specific tax brackets or deductions.
const stateRates: Record<string, number> = {
  AL: 0.05, AK: 0, AZ: 0.025, AR: 0.039, CA: 0.093, CO: 0.044, CT: 0.05, DE: 0.066, FL: 0, GA: 0.0519,
  HI: 0.08, ID: 0.053, IL: 0.0495, IN: 0.0295, IA: 0.038, KS: 0.052, KY: 0.035, LA: 0.03, ME: 0.0715, MD: 0.0575,
  MA: 0.05, MI: 0.0425, MN: 0.0785, MS: 0.05, MO: 0.047, MT: 0.059, NE: 0.052, NV: 0, NH: 0, NJ: 0.0637,
  NM: 0.059, NY: 0.0685, NC: 0.045, ND: 0.025, OH: 0.035, OK: 0.0475, OR: 0.0875, PA: 0.0307, RI: 0.0599, SC: 0.062,
  SD: 0, TN: 0, TX: 0, UT: 0.045, VT: 0.066, VA: 0.0575, WA: 0, WV: 0.0512, WI: 0.053, WY: 0, DC: 0.085,
}

export function stateFromAddress(address: string): string | null {
  const code = address.toUpperCase().match(/,\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/)?.[1]
  return code && Object.hasOwn(stateRates, code) ? code : null
}

export function estimateTaxes(income: number, status: FilingStatus, state: string, deductions = 0, exemptions = 0) {
  if (![income, deductions, exemptions].every(value => Number.isSafeInteger(value) && value >= 0) || !Object.hasOwn(federal, status) || !Object.hasOwn(stateRates, state)) return null
  const { deduction, thresholds } = federal[status]
  const taxable = Math.max(0, income - Math.max(deduction * 100, deductions) - exemptions)
  let previous = 0
  let federalTax = 0
  for (let i = 0; i < rates.length; i++) {
    const limit = (thresholds[i] ?? Infinity) * 100
    federalTax += Math.max(0, Math.min(taxable, limit) - previous) * rates[i]!
    previous = limit
    if (taxable <= limit) break
  }
  const stateTax = Math.round(taxable * stateRates[state]!)
  return { federalTax: Math.round(federalTax), stateTax, total: Math.round(federalTax) + stateTax, taxable, standardDeduction: deduction * 100 }
}

export function estimateTaxInputs(income: number, inputs: TaxInputs) {
  if ([inputs.deductions, inputs.exemptions].some(value => value.trim() === '')) return null
  const deductions = Math.round(Number(inputs.deductions) * 100)
  const exemptions = Math.round(Number(inputs.exemptions) * 100)
  return estimateTaxes(income, inputs.status, inputs.state.trim().toUpperCase(), deductions, exemptions)
}
