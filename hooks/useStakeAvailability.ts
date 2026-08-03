'use client'

import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'

import { getStakeAvailability } from '@/lib/stake-availability'

/** Base-only no-lockup stake availability for the given wallet. */
export const useStakeAvailability = (address?: Address) => {
  return useQuery({
    queryKey: ['stake-availability', address],
    enabled: Boolean(address),
    staleTime: 30_000,
    queryFn: () => {
      if (!address) throw new Error('no address')

      return getStakeAvailability(address)
    },
  })
}
