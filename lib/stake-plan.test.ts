import { decodeFunctionData, erc20Abi } from 'viem'

import { summerStakingAbi } from '@/constants/abis'
import { SUMR_STAKING } from '@/constants/addresses'

import { type StakeAvailability } from './stake-availability'
import { buildStakePlan } from './stake-plan'

const SUMR = SUMR_STAKING.sumrToken
const STAKING = SUMR_STAKING.summerStaking

const availability = (overrides: Partial<StakeAvailability> = {}): StakeAvailability => ({
  chainId: 8453,
  stakingAddress: STAKING,
  sumrToken: SUMR,
  sumrSymbol: 'SUMR',
  sumrDecimals: 18,
  walletBalance: 1_000n,
  remainingCapacity: 1_000n,
  maxStakeable: 1_000n,
  atStakeLimit: false,
  ...overrides,
})

describe('buildStakePlan', () => {
  it('amount === 0n -> []', () => {
    const plan = buildStakePlan({
      availability: availability(),
      amount: 0n,
      sumrAllowance: 0n,
    })

    expect(plan).toEqual([])
  })

  it('sufficient SUMR allowance -> just the stake step', () => {
    const plan = buildStakePlan({
      availability: availability(),
      amount: 500n,
      sumrAllowance: 500n,
    })

    expect(plan.map((step) => step.type)).toEqual(['stake'])
  })

  it('insufficient allowance -> [approve SUMR, stakeLockup]', () => {
    const plan = buildStakePlan({
      availability: availability(),
      amount: 500n,
      sumrAllowance: 0n,
    })

    expect(plan.map((step) => step.type)).toEqual(['approve', 'stake'])

    const approve = decodeFunctionData({ abi: erc20Abi, data: plan[0].tx.data })

    expect(plan[0].tx.to).toBe(SUMR)
    expect(approve.functionName).toBe('approve')
    expect(approve.args).toEqual([STAKING, 500n])
  })

  it('the stakeLockup args are [amount, 0n] - always the no-lockup bucket', () => {
    const plan = buildStakePlan({
      availability: availability(),
      amount: 500n,
      sumrAllowance: 500n,
    })

    const stake = decodeFunctionData({ abi: summerStakingAbi, data: plan[0].tx.data })

    expect(plan[0].tx.to).toBe(STAKING)
    expect(stake.functionName).toBe('stakeLockup')
    expect(stake.args).toEqual([500n, 0n])
  })

  it('every tx carries the Base chainId and zero value', () => {
    const plan = buildStakePlan({
      availability: availability(),
      amount: 500n,
      sumrAllowance: 0n,
    })

    for (const step of plan) {
      expect(step.tx.chainId).toBe(8453)
      expect(step.tx.value).toBe(0n)
    }
  })
})
