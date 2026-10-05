import type { Liability, RealEstate } from '../schemas/financial-plan'

export type LinkedAssetLoan = Liability & { assetId: string; type: 'loan' }

// Debt rows are views of the persisted asset loan, never additional liabilities.
export function linkedAssetLoans(assets: RealEstate[]): LinkedAssetLoan[] {
  return assets.flatMap(asset => asset.loan
    ? [{ ...asset.loan, id: asset.id, assetId: asset.id, name: `${asset.name} loan`, type: 'loan' as const }]
    : [])
}
