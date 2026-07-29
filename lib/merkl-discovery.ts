import { type Address } from "viem";
import { MERKL_API_BASE, MERKL_TRUSTED_CREATORS } from "@/constants/merkl";

export interface MerklApiCampaign {
  campaignId: string;
  computeChainId: number;
  distributionChainId: number;
  creatorAddress: string;
  startTimestamp: number;
  endTimestamp: number;
  type?: string;
  rewardToken: {
    address: Address;
    symbol: string;
    decimals: number;
    chainId: number;
  };
  params?: {
    vaultAddress?: Address;
    targetToken?: Address;
    [key: string]: unknown;
  };
  /** Embedded when the request passes withOpportunity=true. */
  Opportunity?: {
    name?: string;
  };
}

export interface SummerMerklCampaign {
  campaignId: string;
  computeChainId: number;
  distributionChainId: number;
  rewardToken: {
    address: Address;
    symbol: string;
    decimals: number;
    chainId: number;
  };
  vaultAddress: Address | null;
  /** Merkl opportunity display name, e.g. "Deposit USDC on Summer Finance (lower risk)". */
  opportunityName: string | null;
  startTimestamp: number;
  endTimestamp: number;
}

const CACHE_KEY = "summer_merkl_campaigns_v3";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachePayload {
  timestamp: number;
  campaigns: SummerMerklCampaign[];
}

const getCachedCampaigns = (): SummerMerklCampaign[] | null => {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CachePayload;
    if (Date.now() - data.timestamp < CACHE_TTL_MS) {
      return data.campaigns;
    }
  } catch {
    // Ignore storage errors
  }
  return null;
};

const setCachedCampaigns = (campaigns: SummerMerklCampaign[]): void => {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const payload: CachePayload = {
      timestamp: Date.now(),
      campaigns,
    };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors
  }
};

/** All Summer campaigns ever created on Merkl — LIVE and PAST (unclaimed rewards never expire). */
export const discoverSummerCampaigns = async (
  customFetch?: typeof fetch,
  skipCache = false,
): Promise<SummerMerklCampaign[]> => {
  if (!skipCache) {
    const cached = getCachedCampaigns();
    if (cached) return cached;
  }

  const fetcher = customFetch ?? fetch;
  const byId = new Map<string, SummerMerklCampaign>();

  // Enumerate by creator, not by mainProtocolId: JSON_AIRDROP campaigns hang off
  // opportunities with no protocol, so Merkl omits them from
  // ?mainProtocolId=summerfinance entirely. Creator is a strict superset of the
  // protocol lists (verified: 0 campaigns lost, 22 airdrops gained) and matches
  // the trust boundary we already enforce below.
  for (const creator of MERKL_TRUSTED_CREATORS) {
    for (let page = 0; ; page++) {
      const response = await fetcher(
        `${MERKL_API_BASE}/campaigns?creatorAddress=${creator}&items=100&page=${page}&withOpportunity=true`,
      );
      if (!response.ok) {
        throw new Error(`Merkl campaigns fetch failed: ${response.status}`);
      }
      const campaigns = (await response.json()) as MerklApiCampaign[];

      for (const campaign of campaigns) {
        // Re-check creator on the response: if Merkl ever stops honouring the
        // creatorAddress filter, an unfiltered page must not import every
        // campaign on the platform as a "Summer" campaign.
        if (
          !MERKL_TRUSTED_CREATORS.some(
            (trusted) =>
              trusted.toLowerCase() === campaign.creatorAddress.toLowerCase(),
          )
        ) {
          continue;
        }

        byId.set(campaign.campaignId, {
          campaignId: campaign.campaignId,
          computeChainId: campaign.computeChainId,
          distributionChainId: campaign.distributionChainId,
          rewardToken: campaign.rewardToken,
          vaultAddress:
            campaign.params?.vaultAddress ??
            campaign.params?.targetToken ??
            null,
          opportunityName: campaign.Opportunity?.name ?? null,
          startTimestamp: campaign.startTimestamp,
          endTimestamp: campaign.endTimestamp,
        });
      }

      if (campaigns.length < 100) break;
    }
  }

  const result = [...byId.values()];
  setCachedCampaigns(result);
  return result;
};
