import { discoverSummerCampaigns } from "./merkl-discovery";
import { MERKL_TRUSTED_CREATORS } from "@/constants/merkl";

describe("discoverSummerCampaigns", () => {
  const trustedCreator = MERKL_TRUSTED_CREATORS[0];
  const mockCampaign1 = {
    campaignId: "0x1111",
    computeChainId: 8453,
    distributionChainId: 8453,
    creatorAddress: trustedCreator,
    startTimestamp: 1000,
    endTimestamp: 2000,
    rewardToken: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      decimals: 6,
      chainId: 8453,
    },
    params: { vaultAddress: "0xVault1" },
    Opportunity: { name: "Deposit USDC on Summer Finance (lower risk)" },
  };

  const mockCampaign2 = {
    campaignId: "0x2222",
    computeChainId: 8453,
    distributionChainId: 8453,
    creatorAddress: trustedCreator,
    startTimestamp: 1000,
    endTimestamp: 2000,
    rewardToken: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      decimals: 6,
      chainId: 8453,
    },
    params: { vaultAddress: "0xVault2" },
  };

  const mockUntrustedCampaign = {
    campaignId: "0x3333",
    computeChainId: 8453,
    distributionChainId: 8453,
    creatorAddress: "0xUntrustedCreator",
    startTimestamp: 1000,
    endTimestamp: 2000,
    rewardToken: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      decimals: 6,
      chainId: 8453,
    },
  };

  it("fetches, filters trusted creators, and dedupes across protocol IDs", async () => {
    const mockFetch = jest.fn((url: string) => {
      if (url.includes("mainProtocolId=summerfinance")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([mockCampaign1, mockUntrustedCampaign]),
        } as Response);
      }
      if (url.includes("mainProtocolId=SummerFinance")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([mockCampaign1, mockCampaign2]),
        } as Response);
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    const campaigns = await discoverSummerCampaigns(
      mockFetch as unknown as typeof fetch,
      true,
    );

    expect(campaigns).toHaveLength(2);
    expect(campaigns.map((c) => c.campaignId)).toEqual(["0x1111", "0x2222"]);
    expect(campaigns[0].vaultAddress).toBe("0xVault1");
    expect(campaigns[0].opportunityName).toBe(
      "Deposit USDC on Summer Finance (lower risk)",
    );
    // Campaign without an embedded Opportunity falls back to null.
    expect(campaigns[1].opportunityName).toBeNull();
  });

  it("throws when HTTP fetch fails", async () => {
    const mockFetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
      } as Response),
    );

    await expect(
      discoverSummerCampaigns(mockFetch as unknown as typeof fetch, true),
    ).rejects.toThrow("Merkl campaigns fetch failed: 500");
  });
});
