import { describe, expect, it } from 'vitest'
import { estimateTaxInputs, estimateTaxes, stateFromAddress } from '../shared/utils/taxes'

describe('2026 basic income tax estimates', () => {
  it('uses progressive federal brackets and filing-status deductions', () => {
    expect(estimateTaxes(10000000, 'single', 'TX')).toMatchObject({ taxable: 8390000, federalTax: 1317000, stateTax: 0 })
    expect(estimateTaxes(10000000, 'married-jointly', 'TX')?.federalTax).toBe(764000)
    expect(estimateTaxes(10000000, 'head-of-household', 'TX')?.federalTax).toBeLessThan(1317000)
    expect(estimateTaxes(0, 'single', 'TX')?.total).toBe(0)
  })

  it('applies greater itemized deductions and exemptions, with a state estimate', () => {
    expect(estimateTaxes(10000000, 'single', 'CA', 2000000, 500000)).toMatchObject({ taxable: 7500000, stateTax: 697500 })
    expect(estimateTaxes(10000000, 'single', 'CA', 100000, 0)?.taxable).toBe(8390000)
  })

  it('requires a recognized residence and valid amounts rather than silently assuming a state', () => {
    expect(stateFromAddress('123 Main Street, Austin, TX 78701')).toBe('TX')
    expect(stateFromAddress('Seattle, WA')).toBe('WA')
    expect(stateFromAddress('Unknown')).toBeNull()
    expect(stateFromAddress('123 Main, ZZ 12345')).toBeNull()
    expect(estimateTaxes(-1, 'single', 'TX')).toBeNull()
    expect(estimateTaxes(100, 'single', 'ZZ')).toBeNull()
  })

  it('recalculates from typed tax inputs without treating empty fields as zero', () => {
    const inputs = { status: 'single' as const, state: 'tx', deductions: '20000', exemptions: '5000' }
    expect(estimateTaxInputs(10000000, inputs)?.taxable).toBe(7500000)
    expect(estimateTaxInputs(10000000, { ...inputs, state: 'CA' })?.stateTax).toBe(697500)
    expect(estimateTaxInputs(10000000, { ...inputs, deductions: '' })).toBeNull()
    expect(estimateTaxInputs(10000000, { ...inputs, exemptions: '-1' })).toBeNull()
    expect(estimateTaxInputs(10000000, { ...inputs, state: '' })).toBeNull()
  })
})
