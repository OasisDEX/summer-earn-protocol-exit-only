import { type Address, encodeFunctionData, type Hex } from "viem";

import {
  admiralsQuartersAbi,
  fleetCommanderAbi,
  stakingRewardsManagerAbi,
} from "@/constants/abis";
import { CORE_ADDRESSES } from "@/constants/addresses";
import { type FleetPosition } from "@/lib/positions";

export type ExitStepType = "approve" | "exit" | "claim";

export interface ExitStep {
  type: ExitStepType;
  label: string;
  /**
   * Institutional-only: true when this step redeems less than the caller's full wallet shares.
   * Lets consumers (e.g. the UI's completion message) detect a partial exit structurally instead
   * of string-matching the human-readable `label`.
   */
  capped?: boolean;
  tx: { to: Address; data: Hex; value: bigint; chainId: number };
}

/**
 * Institutional exit: one direct ERC-4626 redeem. No approval (the user redeems their own
 * shares), no AdmiralsQuarters (verified: institutional AQs do not implement
 * unstakeAndWithdrawAssets and there is no staked leg to need it), no rewards sweep (every
 * institutional fleet reports stakingRewardsManager == 0x0).
 */
const buildInstitutionalExitPlan = (
  position: FleetPosition,
  user: Address,
  maxRedeem: bigint,
): ExitStep[] => {
  // Ceiling is walletShares, not totalShares: a DIRECT redeem moves shares out of the caller's
  // own wallet balance and can never touch a staked leg. Behaviour-neutral today (every
  // institutional fleet reports stakingRewardsManager == 0x0, so stakedShares is always 0n), but
  // min(totalShares, maxRedeem) would, for a fleet that ever had a staked leg, build a redeem for
  // more shares than the wallet holds - a guaranteed revert that blocks even the walletShares
  // portion.
  // Also cap at maxRedeem: a fleet whose liquidity buffer is short would revert on the full
  // balance, and a partial exit that succeeds beats a full exit that does not.
  const shares =
    maxRedeem < position.walletShares ? maxRedeem : position.walletShares;

  if (shares === 0n) return [];

  const capped = shares < position.walletShares;

  return [
    {
      type: "exit",
      label: capped
        ? `Withdraw ${position.asset.symbol} (capped by vault liquidity)`
        : `Withdraw all ${position.asset.symbol}`,
      capped,
      tx: {
        to: position.fleetAddress,
        data: encodeFunctionData({
          abi: fleetCommanderAbi,
          functionName: "redeem",
          // Shares in, not assets in, so share->asset rounding leaves no dust behind.
          args: [shares, user, user],
        }),
        value: 0n,
        chainId: position.chainId,
      },
    },
  ];
};

/**
 * Full exit to the underlying asset for the PUBLIC path - replicates the SDK's AdmiralsQuarters
 * route. `0` amounts are the protocol's "everything" sentinel (see plan README). Institutional
 * positions never reach this route: they are dispatched above to buildInstitutionalExitPlan, the
 * single-redeem builder, before any of this runs.
 */
export const buildExitPlan = (params: {
  position: FleetPosition;
  user: Address;
  allowance: bigint;
  hasClaimableRewards: boolean;
  /** Institutional path only; the public path exits via the AdmiralsQuarters "everything" sentinel. */
  maxRedeem: bigint;
}): ExitStep[] => {
  const { position, user, allowance, hasClaimableRewards, maxRedeem } = params;

  if (position.institution)
    return buildInstitutionalExitPlan(position, user, maxRedeem);

  const { admiralsQuarters } = CORE_ADDRESSES[position.chainId];
  const steps: ExitStep[] = [];

  // 1. Approve the fleet's share token to AdmiralsQuarters - wallet-held shares only.
  if (position.walletShares > 0n && allowance < position.walletShares) {
    steps.push({
      type: "approve",
      label: `Approve ${position.displayName || position.fleetName} shares`,
      tx: {
        to: position.fleetAddress,
        data: encodeFunctionData({
          abi: fleetCommanderAbi,
          functionName: "approve",
          args: [admiralsQuarters, position.walletShares],
        }),
        value: 0n,
        chainId: position.chainId,
      },
    });
  }

  // 2. The exit itself: one AdmiralsQuarters.multicall, SDK ordering.
  const calls: Hex[] = [];

  if (position.walletShares > 0n) {
    calls.push(
      encodeFunctionData({
        abi: admiralsQuartersAbi,
        functionName: "exitFleet",
        args: [position.fleetAddress, 0n],
      }),
      encodeFunctionData({
        abi: admiralsQuartersAbi,
        functionName: "withdrawTokens",
        args: [position.asset.address, 0n],
      }),
    );
  }

  if (position.stakedShares > 0n) {
    calls.push(
      encodeFunctionData({
        abi: admiralsQuartersAbi,
        functionName: "unstakeAndWithdrawAssets",
        args: [position.fleetAddress, 0n, true],
      }),
    );
  }

  if (calls.length > 0) {
    steps.push({
      type: "exit",
      label: `Withdraw all ${position.asset.symbol}`,
      tx: {
        to: admiralsQuarters,
        data: encodeFunctionData({
          abi: admiralsQuartersAbi,
          functionName: "multicall",
          args: [calls],
        }),
        value: 0n,
        chainId: position.chainId,
      },
    });
  }

  // 3. Rewards left behind after unstaking in the past (staked leg claims automatically).
  if (
    position.stakedShares === 0n &&
    hasClaimableRewards &&
    position.stakingRewardsManager
  ) {
    steps.push({
      type: "claim",
      label: "Claim outstanding rewards",
      tx: {
        to: position.stakingRewardsManager,
        data: encodeFunctionData({
          abi: stakingRewardsManagerAbi,
          functionName: "getReward",
        }),
        value: 0n,
        chainId: position.chainId,
      },
    });
  }

  return steps;
};
