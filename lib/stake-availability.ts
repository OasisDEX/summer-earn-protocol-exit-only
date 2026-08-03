import { type Address, erc20Abi } from "viem";

import { summerStakingAbi } from "@/constants/abis";
import { SUMR_STAKING } from "@/constants/addresses";
import { getPublicClient } from "@/lib/clients";

/** No-lockup (bucket 0) staking headroom for a wallet, plus what it would take to stake. */
export interface StakeAvailability {
  chainId: number;
  stakingAddress: Address;
  /** SUMR - the token the user must approve before staking (NOT stSUMR). */
  sumrToken: Address;
  sumrSymbol: string;
  sumrDecimals: number;
  /** Unstaked SUMR held by the wallet. */
  walletBalance: bigint;
  /** Remaining no-lockup bucket headroom: max(cap - staked, 0). */
  remainingCapacity: bigint;
  /** min(walletBalance, remainingCapacity) - the largest amount that can be staked now. */
  maxStakeable: bigint;
  /** stakesCount >= MAX_AMOUNT_OF_STAKES: the contract rejects any further stake. */
  atStakeLimit: boolean;
}

/**
 * Reads whether a wallet can stake SUMR into the no-lockup bucket (bucket 0) on Base, and how
 * much. `failed` is true only when the Base RPC itself errored, so the caller can distinguish
 * "cannot stake" from "couldn't check" (mirrors `getStakedSumr`). Returns a populated
 * `availability` even when `walletBalance` is `0n` - the decision to hide the card belongs to
 * the page, not this function.
 */
export const getStakeAvailability = async (
  user: Address,
): Promise<{ availability: StakeAvailability | null; failed: boolean }> => {
  const { chainId, summerStaking } = SUMR_STAKING;

  try {
    const client = getPublicClient(chainId);

    // Round 1: config + counts. `allowFailure: false` so a dead RPC throws into the catch below
    // rather than silently returning a healthy-looking availability.
    const [sumrToken, bucketDetails, stakesCount, maxStakes] =
      await client.multicall({
        contracts: [
          {
            address: summerStaking,
            abi: summerStakingAbi,
            functionName: "SUMMER_TOKEN",
          },
          {
            address: summerStaking,
            abi: summerStakingAbi,
            functionName: "getBucketDetails",
            args: [0],
          },
          {
            address: summerStaking,
            abi: summerStakingAbi,
            functionName: "getUserStakesCount",
            args: [user],
          },
          {
            address: summerStaking,
            abi: summerStakingAbi,
            functionName: "MAX_AMOUNT_OF_STAKES",
          },
        ],
        allowFailure: false,
      });

    const [cap, staked] = bucketDetails as readonly [
      bigint,
      bigint,
      bigint,
      bigint,
    ];

    // Round 2: SUMR balance/metadata. The address comes from SUMMER_TOKEN() rather than
    // SUMR_STAKING.sumrToken, for the same reason the stSUMR address is resolved on-chain
    // (see the note in constants/addresses.ts): it is the token the user must approve.
    const [walletBalance, sumrSymbol, sumrDecimals] = await client.multicall({
      contracts: [
        {
          address: sumrToken as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [user],
        },
        {
          address: sumrToken as Address,
          abi: erc20Abi,
          functionName: "symbol",
        },
        {
          address: sumrToken as Address,
          abi: erc20Abi,
          functionName: "decimals",
        },
      ],
      allowFailure: false,
    });

    const remainingCapacity = cap > staked ? cap - staked : 0n;
    const maxStakeable =
      walletBalance < remainingCapacity ? walletBalance : remainingCapacity;

    return {
      availability: {
        chainId,
        stakingAddress: summerStaking,
        sumrToken: sumrToken as Address,
        sumrSymbol,
        sumrDecimals: Number(sumrDecimals),
        walletBalance,
        remainingCapacity,
        maxStakeable,
        atStakeLimit: stakesCount >= maxStakes,
      },
      failed: false,
    };
  } catch {
    return { availability: null, failed: true };
  }
};
