import { type Address, encodeFunctionData, erc20Abi, type Hex } from 'viem'

import { summerStakingAbi } from '@/constants/abis'
import { type StakeAvailability } from '@/lib/stake-availability'

/** Bucket 0 accepts exactly one lockup period: zero. Verified on-chain (min == max == 0). */
export const NO_LOCKUP_PERIOD = 0n

export type StakeStepType = 'approve' | 'stake'

export interface StakeStep {
  type: StakeStepType
  label: string
  tx: { to: Address; data: Hex; value: bigint; chainId: number }
}

/**
 * Builds the ordered on-chain steps for staking SUMR into the no-lockup bucket (bucket 0).
 *
 * Approve SUMR (not stSUMR - staking pulls the plain governance token, unlike unstaking which
 * pulls the staked-receipt token) to the staking contract when the allowance is short, then
 * `stakeLockup(amount, NO_LOCKUP_PERIOD)`. Cap and stake-limit validation lives in the UI, not
 * here - the builder encodes intent and stays trivially testable.
 */
export const buildStakePlan = (params: {
  availability: StakeAvailability
  /** Amount of SUMR to stake, in base units. */
  amount: bigint
  /** Current SUMR allowance: user → staking contract. */
  sumrAllowance: bigint
}): StakeStep[] => {
  const { availability, amount, sumrAllowance } = params
  const { stakingAddress, sumrToken, chainId } = availability
  const steps: StakeStep[] = []

  if (amount <= 0n) return steps

  // 1. Approve SUMR so the staking contract can pull it on stake.
  if (sumrAllowance < amount) {
    steps.push({
      type: 'approve',
      label: 'Approve SUMR',
      tx: {
        to: sumrToken,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [stakingAddress, amount],
        }),
        value: 0n,
        chainId,
      },
    })
  }

  // 2. Stake into the no-lockup bucket.
  steps.push({
    type: 'stake',
    label: 'Stake SUMR',
    tx: {
      to: stakingAddress,
      data: encodeFunctionData({
        abi: summerStakingAbi,
        functionName: 'stakeLockup',
        args: [amount, NO_LOCKUP_PERIOD],
      }),
      value: 0n,
      chainId,
    },
  })

  return steps
}
