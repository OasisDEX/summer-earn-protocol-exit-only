import { encodeFunctionData, type Address, type Hex } from "viem";
import { MERKL_DISTRIBUTOR, merklDistributorAbi } from "@/constants/merkl";
import { type MerklClaimableReward } from "./merkl-rewards";

export interface MerklClaimTx {
  to: Address;
  data: Hex;
  value: bigint;
  chainId: number;
}

export const buildMerklClaimTx = (
  user: Address,
  rewards: MerklClaimableReward[],
): MerklClaimTx | null => {
  const claimable = rewards.filter((reward) => reward.claimableNow > 0n);
  if (claimable.length === 0) return null;

  // A merkle proof only verifies on its own distribution chain — callers must group
  // rewards per chain (see useMerklClaimFlow) before building a claim transaction.
  if (claimable.some((reward) => reward.chainId !== claimable[0].chainId)) {
    throw new Error("buildMerklClaimTx requires rewards from a single chain");
  }

  const users = claimable.map(() => user);
  const tokens = claimable.map((reward) => reward.token.address);
  const amounts = claimable.map((reward) => reward.cumulativeAmount); // CUMULATIVE — NOT claimableNow!
  const proofs = claimable.map((reward) => reward.proofs);

  return {
    to: MERKL_DISTRIBUTOR,
    data: encodeFunctionData({
      abi: merklDistributorAbi,
      functionName: "claim",
      args: [users, tokens, amounts, proofs],
    }),
    value: 0n,
    chainId: claimable[0].chainId,
  };
};
