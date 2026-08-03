'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { type Address, erc20Abi } from 'viem'
import { sendTransaction } from 'wagmi/actions'

import { getPublicClient } from '@/lib/clients'
import { type StakeAvailability } from '@/lib/stake-availability'
import { buildStakePlan, type StakeStep } from '@/lib/stake-plan'
import { wagmiConfig } from '@/providers/Web3Provider'

import { type StepStatus } from './useUnstakeFlow'

export interface StakeRequest {
  availability: StakeAvailability
  amount: bigint
}

export const useStakeFlow = (request: StakeRequest | null, user?: Address) => {
  const [loading, setLoading] = useState(false)
  const [steps, setSteps] = useState<StakeStep[]>([])
  const [statuses, setStatuses] = useState<StepStatus[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [executedAny, setExecutedAny] = useState(false)

  const availability = request?.availability ?? null
  const amount = request?.amount ?? 0n

  // Build the plan whenever a request is opened.
  useEffect(() => {
    let cancelled = false

    setSteps([])
    setStatuses([])
    setErrorMessage(null)
    setExecutedAny(false)

    if (!request || !user) return undefined

    setLoading(true)

    getPublicClient(request.availability.chainId)
      .readContract({
        address: request.availability.sumrToken,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [user, request.availability.stakingAddress],
      })
      .then((sumrAllowance) => {
        if (cancelled) return

        const plan = buildStakePlan({
          availability: request.availability,
          amount: request.amount,
          sumrAllowance,
        })

        setSteps(plan)
        setStatuses(plan.map(() => 'pending'))
      })
      .catch((error: unknown) => {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [request, user])

  const currentIndex = useMemo(() => statuses.findIndex((status) => status !== 'done'), [statuses])
  const resolvedIndex = currentIndex === -1 ? steps.length : currentIndex
  const allDone = steps.length > 0 && resolvedIndex === steps.length

  const executeCurrent = useCallback(async () => {
    if (!availability || resolvedIndex >= steps.length) return

    const step = steps[resolvedIndex]

    setErrorMessage(null)
    setStatuses((previous) =>
      previous.map((status, index) => (index === resolvedIndex ? 'in-progress' : status)),
    )

    try {
      // See useExitFlow: the runtime chainId always comes from a configured chain; the cast only
      // satisfies wagmi's literal-union typing of the `chainId` param.
      const hash = await sendTransaction(wagmiConfig, {
        to: step.tx.to,
        data: step.tx.data,
        value: step.tx.value,
        chainId: step.tx.chainId as (typeof wagmiConfig)['chains'][number]['id'],
      })

      const receipt = await getPublicClient(step.tx.chainId).waitForTransactionReceipt({ hash })

      if (receipt.status !== 'success') throw new Error('Transaction reverted on-chain')

      setExecutedAny(true)
      setStatuses((previous) =>
        previous.map((status, index) => (index === resolvedIndex ? 'done' : status)),
      )
    } catch (error: unknown) {
      setStatuses((previous) =>
        previous.map((status, index) => (index === resolvedIndex ? 'error' : status)),
      )
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }, [availability, steps, resolvedIndex])

  return {
    loading,
    steps,
    statuses,
    currentIndex: resolvedIndex,
    allDone,
    executedAny,
    errorMessage,
    executeCurrent,
    amount,
  }
}
