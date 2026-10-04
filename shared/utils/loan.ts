export function loanDetailsError(apr: string | number, years: string | number): string {
  if (!String(apr).trim() || !Number.isFinite(Number(apr)) || Number(apr) < 0 || Number(apr) > 1000) return 'Enter the loan APR (0 for an interest-free loan).'
  if (!String(years).trim() || !Number.isFinite(Number(years)) || Number(years) * 12 < 1 || Number(years) > 40) return 'Enter the remaining loan duration, from 1 month to 40 years.'
  return ''
}

export function monthlyLoanPayment(balance: number, apr: number, termMonths: number): number {
  if (!Number.isSafeInteger(balance) || balance < 0 || !Number.isFinite(apr) || apr < 0 || !Number.isInteger(termMonths) || termMonths < 1 || termMonths > 480) return NaN
  if (!balance) return 0
  const rate = apr / 1200
  return Math.ceil(rate === 0 ? balance / termMonths : balance * rate / (1 - Math.pow(1 + rate, -termMonths)))
}
