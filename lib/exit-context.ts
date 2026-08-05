import { type Address } from "viem";

import { fleetCommanderAbi, stakingRewardsManagerAbi } from "@/constants/abis";
import { CORE_ADDRESSES } from "@/constants/addresses";
import { getPublicClient } from "@/lib/clients";
import { type FleetPosition } from "@/lib/positions";

export interface ExitContext {
  allowance: bigint;
  paused: boolean;
  hasClaimableRewards: boolean;
  /** Institutional path only; 0n for public positions, which ignore it. */
  maxRedeem: bigint;
}

export const readExitContext = async (
  position: FleetPosition,
  user: Address,
): Promise<ExitContext> => {
  const client = getPublicClient(position.chainId);

  // Institutional positions exit with one direct redeem: no AdmiralsQuarters is involved, so
  // there is no allowance to read, and stakingRewardsManager is always 0x0, so there are no
  // rewards to sweep. maxRedeem is read instead, to cap the redeem when the fleet's liquidity
  // buffer is short.
  if (position.institution) {
    const [maxRedeem, paused] = await Promise.all([
      client
        .readContract({
          address: position.fleetAddress,
          abi: fleetCommanderAbi,
          functionName: "maxRedeem",
          args: [user],
        })
        // Fail safe to walletShares (not totalShares) rather than to 0n: a failed cosmetic read
        // must never turn an exitable position into an empty plan, and a DIRECT redeem can only
        // ever pull from wallet-held shares - totalShares (wallet + staked) would fail-safe into
        // a redeem request larger than the wallet actually holds.
        .catch(() => position.walletShares),
      client
        .readContract({
          address: position.fleetAddress,
          abi: fleetCommanderAbi,
          functionName: "paused",
        })
        .catch(() => false),
    ]);

    return { allowance: 0n, paused, hasClaimableRewards: false, maxRedeem };
  }

  const { admiralsQuarters } = CORE_ADDRESSES[position.chainId];

  const [allowance, paused] = await Promise.all([
    client.readContract({
      address: position.fleetAddress,
      abi: fleetCommanderAbi,
      functionName: "allowance",
      args: [user, admiralsQuarters],
    }),
    client
      .readContract({
        address: position.fleetAddress,
        abi: fleetCommanderAbi,
        functionName: "paused",
      })
      .catch(() => false),
  ]);

  let hasClaimableRewards = false;

  if (position.stakingRewardsManager) {
    try {
      const rewardsManager = position.stakingRewardsManager;
      const count = await client.readContract({
        address: rewardsManager,
        abi: stakingRewardsManagerAbi,
        functionName: "rewardTokensLength",
      });
      const rewardTokens = await Promise.all(
        Array.from({ length: Number(count) }, (_, index) =>
          client.readContract({
            address: rewardsManager,
            abi: stakingRewardsManagerAbi,
            functionName: "rewardTokens",
            args: [BigInt(index)],
          }),
        ),
      );
      const earned = await Promise.all(
        rewardTokens.map((token) =>
          client.readContract({
            address: rewardsManager,
            abi: stakingRewardsManagerAbi,
            functionName: "earned",
            args: [user, token],
          }),
        ),
      );

      hasClaimableRewards = earned.some((amount) => amount > 0n);
    } catch {
      hasClaimableRewards = false; // cosmetic - never block the exit on a rewards read failure
    }
  }

  return { allowance, paused, hasClaimableRewards, maxRedeem: 0n };
};
