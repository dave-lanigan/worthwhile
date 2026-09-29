import { AGE_NET_WORTH_PERCENTILE_THRESHOLDS } from './age-wealth-percentile-thresholds'

export const WEALTH_BENCHMARK = {
  year: 2022,
  source: 'https://www.federalreserve.gov/econres/scfindex.htm',
  extract: 'https://www.federalreserve.gov/econres/files/scfp2022excel.zip',
}

export type WealthAgeBand = keyof typeof AGE_NET_WORTH_PERCENTILE_THRESHOLDS

export const WEALTH_AGE_BANDS: Record<WealthAgeBand, { label: string }> = {
  under25: { label: 'Under 25' },
  ages25to29: { label: 'Ages 25–29' },
  ages30to34: { label: 'Ages 30–34' },
  ages35to39: { label: 'Ages 35–39' },
  ages40to44: { label: 'Ages 40–44' },
  ages45to49: { label: 'Ages 45–49' },
  ages50to54: { label: 'Ages 50–54' },
  ages55to59: { label: 'Ages 55–59' },
  ages60to64: { label: 'Ages 60–64' },
  ages65to69: { label: 'Ages 65–69' },
  ages70to74: { label: 'Ages 70–74' },
  ages75plus: { label: 'Ages 75+' },
}

export const NET_WORTH_PERCENTILE_THRESHOLDS = [
  -76700, -45700, -26690, -14970, -9800, -4620, -900, 1, 181, 450,
  1000, 2502, 4000, 5180, 6500, 7700, 9360, 10400, 11700, 13500,
  15671, 17940, 20700, 23300, 27000, 30350, 34200, 39490, 44916, 51400,
  56930, 62600, 67620, 72780, 78850, 84420, 89700, 96750, 102005, 110030,
  117700, 126080, 132500, 141750, 147200, 156100, 164500, 172620, 181430, 192700,
  201830, 212700, 223030, 238900, 250320, 263000, 274000, 288900, 298600, 312560,
  326300, 348790, 366640, 385600, 402500, 415100, 429750, 449800, 466771, 491600,
  520550, 552000, 586500, 621500, 659000, 694960, 746300, 786000, 833000, 888600,
  943800, 1002000, 1075100, 1163000, 1242100, 1310300, 1390000, 1516500, 1690000, 1936900,
  2162050, 2383940, 2684200, 3100330, 3795600, 4694300, 6178000, 8406000, 13615400,
] as const

function percentileFromThresholds(cents: number, thresholds: readonly number[]): number | null {
  if (!Number.isSafeInteger(cents)) return null
  const dollars = cents / 100
  if (dollars < thresholds[0]!) return 0
  if (dollars > thresholds.at(-1)!) return 100
  for (let index = 1; index < thresholds.length; index++) {
    const upper = thresholds[index]!
    if (dollars <= upper) {
      const lower = thresholds[index - 1]!
      return index + (dollars - lower) / (upper - lower)
    }
  }
  return 99
}

export function netWorthPercentile(cents: number): number | null {
  return percentileFromThresholds(cents, NET_WORTH_PERCENTILE_THRESHOLDS)
}

export function wealthAgeBand(age: number): WealthAgeBand | null {
  if (!Number.isInteger(age) || age < 0 || age > 120) return null
  if (age < 25) return 'under25'
  if (age < 30) return 'ages25to29'
  if (age < 35) return 'ages30to34'
  if (age < 40) return 'ages35to39'
  if (age < 45) return 'ages40to44'
  if (age < 50) return 'ages45to49'
  if (age < 55) return 'ages50to54'
  if (age < 60) return 'ages55to59'
  if (age < 65) return 'ages60to64'
  if (age < 70) return 'ages65to69'
  if (age < 75) return 'ages70to74'
  return 'ages75plus'
}

export function ageOnDate(birthDate: string, comparisonDate: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(comparisonDate.getTime())) return null
  const [year, month, day] = birthDate.split('-').map(Number)
  const parsedBirthDate = new Date(Date.UTC(year!, month! - 1, day!))
  if (parsedBirthDate.getUTCFullYear() !== year || parsedBirthDate.getUTCMonth() !== month! - 1 || parsedBirthDate.getUTCDate() !== day) return null
  const comparisonYear = comparisonDate.getUTCFullYear()
  const comparisonMonth = comparisonDate.getUTCMonth()
  const comparisonDay = comparisonDate.getUTCDate()
  let age = comparisonYear - year!
  if (comparisonMonth < month! - 1 || (comparisonMonth === month! - 1 && comparisonDay < day!)) age -= 1
  return age < 0 || age > 120 ? null : age
}

export function ageGroupNetWorthPercentile(cents: number, birthDate: string, comparisonDate: Date): { band: WealthAgeBand, percentile: number | null } | null {
  const age = ageOnDate(birthDate, comparisonDate)
  const band = age === null ? null : wealthAgeBand(age)
  return band ? { band, percentile: percentileFromThresholds(cents, AGE_NET_WORTH_PERCENTILE_THRESHOLDS[band]) } : null
}

export function percentileLabel(percentile: number | null): string {
  if (percentile === null) return '--'
  if (percentile < 1) return 'Below 1st percentile'
  if (percentile > 99) return 'Above 99th percentile'
  const rounded = Math.round(percentile)
  const category = new Intl.PluralRules('en-US', { type: 'ordinal' }).select(rounded)
  const suffix = { one: 'st', two: 'nd', few: 'rd', other: 'th', zero: 'th', many: 'th' }[category]
  return `Approx. ${rounded}${suffix} percentile`
}