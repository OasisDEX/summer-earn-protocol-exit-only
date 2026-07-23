"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";

import { SUPPORTED_CHAIN_IDS } from "@/constants/chains";
import { discoverSummerCampaigns } from "@/lib/merkl-discovery";
import { getMerklRewards } from "@/lib/merkl-rewards";

export const useMerklRewards = (address?: Address) => {
  return useQuery({
    queryKey: ["merkl-rewards", address],
    enabled: Boolean(address),
    staleTime: 60_000,
    queryFn: async () => {
      if (!address) throw new Error("no address");

      const campaigns = await discoverSummerCampaigns();
      // Claiming requires the distribution chain to be configured in the app
      // (wagmi chains + RPCs) — drop campaigns distributing elsewhere rather
      // than surfacing rewards the app cannot claim.
      const claimableCampaigns = campaigns.filter((campaign) =>
        SUPPORTED_CHAIN_IDS.some(
          (chainId) => chainId === campaign.distributionChainId,
        ),
      );
      return getMerklRewards(address, claimableCampaigns);
    },
  });
};
