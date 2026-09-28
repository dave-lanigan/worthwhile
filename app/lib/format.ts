const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const preciseDollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const compactDollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })

export function money(cents: number, precise = false) {
  return (precise ? preciseDollars : dollars).format(cents / 100)
}

export function compactMoney(cents: number) {
  return compactDollars.format(cents / 100)
}

export function monthLabel(month: number, start: string) {
  if (!Number.isSafeInteger(month) || month < 0 || month > 480) return '--'
  const date = new Date(`${start}-01T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + month)
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
}