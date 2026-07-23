"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type Address } from "viem";
import { sendTransaction } from "wagmi/actions";

import { getPublicClient } from "@/lib/clients";
import { buildMerklClaimTx, type MerklClaimTx } from "@/lib/merkl-claim-plan";
import { type MerklClaimableReward } from "@/lib/merkl-rewards";
import { wagmiConfig } from "@/providers/Web3Provider";

export type MerklClaimStatus = "idle" | "in-progress" | "done" | "error";

export const useMerklClaimFlow = (
  rewards: MerklClaimableReward[],
  user?: Address,
) => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<MerklClaimStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [executed, setExecuted] = useState(false);

  const executeClaim = useCallback(async () => {
    if (!user || rewards.length === 0) return;

    // A merkle proof only verifies on its own distribution chain, so claims must be
    // grouped per chain — one claim() transaction per distribution chain.
    const rewardsByChain = new Map<number, MerklClaimableReward[]>();
    for (const reward of rewards) {
      const group = rewardsByChain.get(reward.chainId) ?? [];
      group.push(reward);
      rewardsByChain.set(reward.chainId, group);
    }

    const txs = [...rewardsByChain.values()]
      .map((group) => buildMerklClaimTx(user, group))
      .filter((tx): tx is MerklClaimTx => tx !== null);

    if (txs.length === 0) {
      setErrorMessage("No claimable rewards available");
      setStatus("error");
      return;
    }

    setErrorMessage(null);
    setStatus("in-progress");

    let anyClaimed = false;

    try {
      for (const tx of txs) {
        const hash = await sendTransaction(wagmiConfig, {
          to: tx.to,
          data: tx.data,
          value: tx.value,
          chainId: tx.chainId as (typeof wagmiConfig)["chains"][number]["id"],
        });

        // Wait via our own RPC (public client), independent of the wallet's provider.
        const receipt = await getPublicClient(
          tx.chainId,
        ).waitForTransactionReceipt({ hash });

        if (receipt.status !== "success") {
          throw new Error("Transaction reverted on-chain");
        }

        anyClaimed = true;
        setExecuted(true);
      }

      setStatus("done");
    } catch (error: unknown) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }

    if (anyClaimed) {
      // Refetch after 60 seconds (the Merkl API reflects on-chain claims with a delay)
      setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: ["merkl-rewards", user],
        });
      }, 60_000);
    }
  }, [user, rewards, queryClient]);

  return {
    status,
    errorMessage,
    executed,
    executeClaim,
  };
};
