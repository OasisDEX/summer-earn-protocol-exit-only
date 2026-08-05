import { disambiguateInstitutionNames, institutionDisplayName } from './institution-name'

const position = (
  institutionId: string | null,
  displayName: string,
  fleetAddress: `0x${string}`,
) => ({
  fleetAddress,
  displayName,
  institution: institutionId === null ? null : { id: institutionId },
})

describe('institutionDisplayName', () => {
  it('joins the institution id and the asset symbol', () => {
    expect(institutionDisplayName('Targen', 'USDC')).toBe('Targen USDC')
  })

  it('keeps subgraph ids verbatim, underscores included', () => {
    expect(institutionDisplayName('ExtDemoCorp_3', 'USDC')).toBe('ExtDemoCorp_3 USDC')
  })
})

describe('disambiguateInstitutionNames', () => {
  it('leaves a label used exactly once untouched', () => {
    const result = disambiguateInstitutionNames([
      position('Targen', 'Targen USDC', '0x6e23CfE8D830488Bc824C0aDD201A1A2E1dFDBEb'),
    ])

    expect(result[0].displayName).toBe('Targen USDC')
  })

  it('suffixes a shortened fleet address when two positions share a label', () => {
    // ExtDemoCorp_3 owns two fleets whose on-chain name() is identical, so a wallet holding
    // both would otherwise see two indistinguishable cards.
    const result = disambiguateInstitutionNames([
      position('ExtDemoCorp_3', 'ExtDemoCorp_3 USDC', '0x44e39D3EB84fa25c2031252Fc229F2a74A3800D4'),
      position('ExtDemoCorp_3', 'ExtDemoCorp_3 USDC', '0xea342341Dc8dD1bca787Fac812dF9080A273d724'),
    ])

    expect(result.map((entry) => entry.displayName)).toEqual([
      'ExtDemoCorp_3 USDC (0x44e3…00D4)',
      'ExtDemoCorp_3 USDC (0xea34…d724)',
    ])
  })

  it('disambiguates across chains too', () => {
    // ExtDemoCorp has one fleet on Arbitrum and one on Base; both resolve to "ExtDemoCorp USDC".
    const result = disambiguateInstitutionNames([
      position('ExtDemoCorp', 'ExtDemoCorp USDC', '0x2D55c68e6b9b6B3f70be2e51f289751E627f50aD'),
      position('ExtDemoCorp', 'ExtDemoCorp USDC', '0x1dB644c6077912cF5DaB0B5A7f2D8eFB5B61df5C'),
    ])

    expect(result[0].displayName).toBe('ExtDemoCorp USDC (0x2D55…50aD)')
    expect(result[1].displayName).toBe('ExtDemoCorp USDC (0x1dB6…df5C)')
  })

  it('never rewrites a public position, even if its label collides', () => {
    const result = disambiguateInstitutionNames([
      position(null, 'USDC Base Lower Risk', '0x98C49e13bf99D7CAd8069faa2A370933EC9EcF17'),
      position(null, 'USDC Base Lower Risk', '0x2bB9AD69FEba5547B7cd57AAfE8457d40Bf834aF'),
    ])

    expect(result.map((entry) => entry.displayName)).toEqual([
      'USDC Base Lower Risk',
      'USDC Base Lower Risk',
    ])
  })

  it('returns the input objects unchanged when nothing collides', () => {
    const input = [position('Targen', 'Targen USDC', '0x6e23CfE8D830488Bc824C0aDD201A1A2E1dFDBEb')]
    const result = disambiguateInstitutionNames(input)

    expect(result[0]).toBe(input[0])
  })
})
