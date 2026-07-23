import { type Address } from "viem";
import {
  MERKL_API_BASE,
  MERKL_PROTOCOL_IDS,
  MERKL_TRUSTED_CREATORS,
} from "@/constants/merkl";

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
  startTimestamp: number;
  endTimestamp: number;
}

const CACHE_KEY = "summer_merkl_campaigns_v1";
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

  for (const protocolId of MERKL_PROTOCOL_IDS) {
    for (let page = 0; ; page++) {
      const response = await fetcher(
        `${MERKL_API_BASE}/campaigns?mainProtocolId=${protocolId}&items=100&page=${page}`,
      );
      if (!response.ok) {
        throw new Error(`Merkl campaigns fetch failed: ${response.status}`);
      }
      const campaigns = (await response.json()) as MerklApiCampaign[];

      for (const campaign of campaigns) {
        if (
          MERKL_TRUSTED_CREATORS.length > 0 &&
          !MERKL_TRUSTED_CREATORS.some(
            (creator) =>
              creator.toLowerCase() === campaign.creatorAddress.toLowerCase(),
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
