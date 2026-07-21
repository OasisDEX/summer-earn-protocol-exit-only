import { type Address } from 'viem'

import { type FleetPosition } from './positions'
import { estimateUsdValue, type UsdPrices } from './prices'

// Only the fields estimateUsdValue actually reads matter; the rest are filler to satisfy the type.
const positionWith = (
  symbol: string,
  decimals: number,
  totalAssets: bigint,
): FleetPosition => ({
  chainId: 1,
  fleetAddress: '0x0000000000000000000000000000000000000001' as Address,
  fleetName: 'Test',
  displayName: 'Test',
  asset: { address: '0x0000000000000000000000000000000000000002' as Address, symbol, decimals },
  walletShares: 0n,
  stakedShares: 0n,
  totalShares: 0n,
  totalAssets,
  stakingRewardsManager: null,
  paused: false,
})

const prices: UsdPrices = { eth: 2000, eur: 1.1, usdc: 0.9998, usdt: 0.999 }

describe('estimateUsdValue', () => {
  it('prices USDC off the USDC feed, scaled by the asset decimals', () => {
    // 100 USDC (6 decimals) * 0.9998
    expect(estimateUsdValue(positionWith('USDC', 6, 100_000000n), prices)).toBeCloseTo(99.98)
  })

  it('prices USDT off the USDT feed', () => {
    expect(estimateUsdValue(positionWith('USDT', 6, 50_000000n), prices)).toBeCloseTo(49.95)
  })

  it('prices USD₮0 off the USDT feed (Tether under a different symbol, no feed of its own)', () => {
    expect(estimateUsdValue(positionWith('USD₮0', 6, 50_000000n), prices)).toBeCloseTo(49.95)
  })

  it('prices WETH off the ETH feed', () => {
    // 2 WETH (18 decimals) * 2000
    expect(estimateUsdValue(positionWith('WETH', 18, 2_000000000000000000n), prices)).toBeCloseTo(
      4000,
    )
  })

  it('prices EURC off the EUR feed', () => {
    expect(estimateUsdValue(positionWith('EURC', 6, 10_000000n), prices)).toBeCloseTo(11)
  })

  it('is case-insensitive on the symbol', () => {
    expect(estimateUsdValue(positionWith('usdc', 6, 100_000000n), prices)).toBeCloseTo(99.98)
  })

  it('falls back to a 1:1 peg for stablecoins when the feed is unavailable', () => {
    const noStableFeeds: UsdPrices = { eth: 2000, eur: 1.1, usdc: null, usdt: null }
    expect(estimateUsdValue(positionWith('USDC', 6, 100_000000n), noStableFeeds)).toBeCloseTo(100)
    expect(estimateUsdValue(positionWith('USDT', 6, 100_000000n), noStableFeeds)).toBeCloseTo(100)
  })

  it('returns null for non-stable assets when their feed is unavailable', () => {
    const noEthFeed: UsdPrices = { eth: null, eur: null, usdc: 1, usdt: 1 }
    expect(estimateUsdValue(positionWith('WETH', 18, 1_000000000000000000n), noEthFeed)).toBeNull()
    expect(estimateUsdValue(positionWith('EURC', 6, 1_000000n), noEthFeed)).toBeNull()
  })

  it('returns null for an unrecognised asset symbol', () => {
    expect(estimateUsdValue(positionWith('DAI', 18, 1_000000000000000000n), prices)).toBeNull()
  })
})
