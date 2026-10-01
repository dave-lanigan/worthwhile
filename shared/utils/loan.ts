export function monthlyLoanPayment(balance: number, apr: number, termMonths: number): number {
  if (!Number.isSafeInteger(balance) || balance < 0 || !Number.isFinite(apr) || apr < 0 || !Number.isInteger(termMonths) || termMonths < 1 || termMonths > 480) return NaN
  if (!balance) return 0
  const rate = apr / 1200
  return Math.ceil(rate === 0 ? balance / termMonths : balance * rate / (1 - Math.pow(1 + rate, -termMonths)))
}
