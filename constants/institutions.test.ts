import { getAddress, isAddress } from 'viem'

import { SUPPORTED_CHAIN_IDS } from './chains'
import { INSTITUTIONS } from './institutions'

describe('INSTITUTIONS', () => {
  it('lists all six known institutional deployments', () => {
    expect(INSTITUTIONS).toHaveLength(6)
    expect(INSTITUTIONS.map((institution) => institution.id)).toContain('Targen')
  })

  it('stores every HarborCommand as a valid all-lowercase address', () => {
    for (const { id, harborCommand } of INSTITUTIONS) {
      expect(isAddress(harborCommand)).toBe(true)
      // Lowercase by convention: viem only checksum-validates mixed-case strings, so a
      // hand-typed checksum is a latent crash. See Global Constraints.
      expect(harborCommand).toBe(harborCommand.toLowerCase())
      // Sanity: the lowercase form still round-trips through viem's checksummer.
      expect(() => getAddress(harborCommand)).not.toThrow()
      expect(id).not.toBe('')
    }
  })

  it('never repeats a HarborCommand', () => {
    const seen = INSTITUTIONS.map((institution) => institution.harborCommand)

    expect(new Set(seen).size).toBe(seen.length)
  })

  it('only references chains the app supports', () => {
    for (const { chainId } of INSTITUTIONS) {
      expect(SUPPORTED_CHAIN_IDS).toContain(chainId)
    }
  })
})
