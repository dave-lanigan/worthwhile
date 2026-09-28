export const WEALTH_BENCHMARK = {
  year: 2022,
  source: 'https://www.federalreserve.gov/econres/scfindex.htm',
  extract: 'https://www.federalreserve.gov/econres/files/scfp2022excel.zip',
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

export function netWorthPercentile(cents: number): number | null {
  if (!Number.isSafeInteger(cents)) return null
  const dollars = cents / 100
  if (dollars < NET_WORTH_PERCENTILE_THRESHOLDS[0]) return 0
  if (dollars > NET_WORTH_PERCENTILE_THRESHOLDS.at(-1)!) return 100
  for (let index = 1; index < NET_WORTH_PERCENTILE_THRESHOLDS.length; index++) {
    const upper = NET_WORTH_PERCENTILE_THRESHOLDS[index]!
    if (dollars <= upper) {
      const lower = NET_WORTH_PERCENTILE_THRESHOLDS[index - 1]!
      return index + (dollars - lower) / (upper - lower)
    }
  }
  return 99
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