import { type Address, type Hex } from "viem";
import { MERKL_API_BASE } from "@/constants/merkl";
import { type SummerMerklCampaign } from "./merkl-discovery";

export interface MerklBreakdown {
  reason?: string;
  amount: string;
  claimed?: string;
  pending?: string;
  campaignId: string;
}

export interface MerklApiRewardItem {
  root: string;
  recipient: string;
  amount: string;
  claimed: string;
  pending: string;
  proofs: Hex[];
  token: {
    address: Address;
    chainId: number;
    symbol: string;
    decimals: number;
    price?: number | null;
  };
  breakdowns?: MerklBreakdown[];
}

export interface MerklApiUserRewardsResponse {
  chain: { id: number; name: string };
  rewards: MerklApiRewardItem[];
}

export interface MerklClaimableReward {
  chainId: number; // distribution chain — where claim() is sent
  token: {
    address: Address;
    symbol: string;
    decimals: number;
    price: number | null;
  };
  cumulativeAmount: bigint; // goes into claim()
  claimed: bigint;
  claimableNow: bigint; // cumulativeAmount - claimed (display + gating)
  pending: bigint; // accrued, claimable after next root update (display only)
  proofs: Hex[];
  /** Portion of cumulativeAmount attributable to Summer campaigns (display only). */
  summerAmount: bigint;
  /** Which Summer vaults/campaigns contributed (display only). */
  sources: {
    campaignId: string;
    vaultAddress: Address | null;
    amount: bigint;
  }[];
}

export const getMerklRewards = async (
  user: Address,
  campaigns: SummerMerklCampaign[],
  customFetch?: typeof fetch,
): Promise<{ rewards: MerklClaimableReward[]; failedChainIds: number[] }> => {
  if (!user || campaigns.length === 0) {
    return { rewards: [], failedChainIds: [] };
  }

  const fetcher = customFetch ?? fetch;
  const campaignById = new Map(
    campaigns.map((campaign) => [campaign.campaignId, campaign]),
  );
  const chainIds = [
    ...new Set(campaigns.map((campaign) => campaign.distributionChainId)),
  ];

  const results = await Promise.allSettled(
    chainIds.map(async (chainId) => {
      const response = await fetcher(
        `${MERKL_API_BASE}/users/${user}/rewards?chainId=${chainId}&reloadChainId=${chainId}&claimableOnly=false`,
      );
      if (!response.ok) {
        throw new Error(`Merkl rewards ${response.status} for chain ${chainId}`);
      }
      const data = (await response.json()) as MerklApiUserRewardsResponse[];
      return { chainId, data };
    }),
  );

  const rewards: MerklClaimableReward[] = [];
  const failedChainIds: number[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const chainId = chainIds[i];

    if (result.status === "rejected") {
      failedChainIds.push(chainId);
      continue;
    }

    const responseList = result.value.data;
    if (!Array.isArray(responseList)) continue;

    for (const chainResponse of responseList) {
      const rewardItems = chainResponse.rewards ?? [];

      for (const item of rewardItems) {
        const breakdowns = item.breakdowns ?? [];
        const summerBreakdowns = breakdowns.filter((b) =>
          campaignById.has(b.campaignId),
        );

        // Surface token reward only if at least one breakdown belongs to a Summer campaign
        if (summerBreakdowns.length === 0) continue;

        const cumulativeAmount = BigInt(item.amount ?? "0");
        const claimed = BigInt(item.claimed ?? "0");
        const pending = BigInt(item.pending ?? "0");
        const rawClaimable = cumulativeAmount - claimed;
        const claimableNow = rawClaimable > 0n ? rawClaimable : 0n;

        if (claimableNow === 0n && pending === 0n) continue;

        let summerAmount = 0n;
        const sources: MerklClaimableReward["sources"] = [];

        for (const b of summerBreakdowns) {
          const amt = BigInt(b.amount ?? "0");
          summerAmount += amt;
          const campaign = campaignById.get(b.campaignId);
          sources.push({
            campaignId: b.campaignId,
            vaultAddress: campaign?.vaultAddress ?? null,
            amount: amt,
          });
        }

        rewards.push({
          chainId: chainResponse.chain?.id ?? chainId,
          token: {
            address: item.token.address,
            symbol: item.token.symbol,
            decimals: item.token.decimals,
            price: item.token.price ?? null,
          },
          cumulativeAmount,
          claimed,
          claimableNow,
          pending,
          proofs: item.proofs ?? [],
          summerAmount,
          sources,
        });
      }
    }
  }

  return { rewards, failedChainIds };
};
