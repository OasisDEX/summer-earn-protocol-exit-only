import { discoverSummerCampaigns } from "./merkl-discovery";
import { MERKL_TRUSTED_CREATORS } from "@/constants/merkl";

describe("discoverSummerCampaigns", () => {
  const trustedCreator = MERKL_TRUSTED_CREATORS[0];
  const rewardToken = {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    symbol: "USDC",
    decimals: 6,
    chainId: 8453,
  };

  const mockCampaign1 = {
    campaignId: "0x1111",
    computeChainId: 8453,
    distributionChainId: 8453,
    creatorAddress: trustedCreator,
    startTimestamp: 1000,
    endTimestamp: 2000,
    rewardToken,
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
    rewardToken,
    params: { vaultAddress: "0xVault2" },
  };

  /**
   * Shape of the Ethereum campaign that the old mainProtocolId-based discovery
   * missed: a JSON_AIRDROP whose Opportunity has no protocol, so Merkl does not
   * return it under ?mainProtocolId=summerfinance, and whose params carry no
   * vaultAddress/targetToken.
   */
  const mockAirdropCampaign = {
    campaignId:
      "0xed07c79960f38e4189cdc6d031c35a66949c052866995205c54ccb954d5a9fe5",
    computeChainId: 1,
    distributionChainId: 1,
    creatorAddress: trustedCreator,
    startTimestamp: 1785139200,
    endTimestamp: 1785142800,
    type: "JSON_AIRDROP",
    rewardToken: {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      symbol: "USDC",
      decimals: 6,
      chainId: 1,
    },
    params: { url: "Lazy Summer Ethereum USDC Claim" },
    Opportunity: { name: "Lazy Summer Ethereum USDC Claim" },
  };

  const mockUntrustedCampaign = {
    campaignId: "0x3333",
    computeChainId: 8453,
    distributionChainId: 8453,
    creatorAddress: "0xUntrustedCreator",
    startTimestamp: 1000,
    endTimestamp: 2000,
    rewardToken,
  };

  it("queries one campaign list per trusted creator, not per protocol id", async () => {
    const mockFetch = jest.fn((_url: string) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response),
    );

    await discoverSummerCampaigns(mockFetch as unknown as typeof fetch, true);

    const urls = mockFetch.mock.calls.map((call) => String(call[0]));
    for (const creator of MERKL_TRUSTED_CREATORS) {
      expect(
        urls.some((url) => url.includes(`creatorAddress=${creator}`)),
      ).toBe(true);
    }
    expect(urls.some((url) => url.includes("mainProtocolId"))).toBe(false);
  });

  it("includes airdrop campaigns that carry no vaultAddress param", async () => {
    const mockFetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([mockAirdropCampaign]),
      } as Response),
    );

    const campaigns = await discoverSummerCampaigns(
      mockFetch as unknown as typeof fetch,
      true,
    );

    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].campaignId).toBe(mockAirdropCampaign.campaignId);
    expect(campaigns[0].distributionChainId).toBe(1);
    expect(campaigns[0].vaultAddress).toBeNull();
    expect(campaigns[0].opportunityName).toBe(
      "Lazy Summer Ethereum USDC Claim",
    );
  });

  it("maps vault address and opportunity name, falling back to null", async () => {
    const mockFetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([mockCampaign1, mockCampaign2]),
      } as Response),
    );

    const campaigns = await discoverSummerCampaigns(
      mockFetch as unknown as typeof fetch,
      true,
    );

    expect(campaigns.map((c) => c.campaignId)).toEqual(["0x1111", "0x2222"]);
    expect(campaigns[0].vaultAddress).toBe("0xVault1");
    expect(campaigns[0].opportunityName).toBe(
      "Deposit USDC on Summer Finance (lower risk)",
    );
    // Campaign without an embedded Opportunity falls back to null.
    expect(campaigns[1].opportunityName).toBeNull();
  });

  it("drops campaigns from creators the API did not filter out", async () => {
    const mockFetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([mockCampaign1, mockUntrustedCampaign]),
      } as Response),
    );

    const campaigns = await discoverSummerCampaigns(
      mockFetch as unknown as typeof fetch,
      true,
    );

    expect(campaigns.map((c) => c.campaignId)).toEqual(["0x1111"]);
  });

  it("keeps paging until a page comes back short", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      ...mockCampaign1,
      campaignId: `0xpage0-${i}`,
    }));
    const mockFetch = jest.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(url.includes("page=0") ? fullPage : [mockCampaign2]),
      } as Response),
    );

    const campaigns = await discoverSummerCampaigns(
      mockFetch as unknown as typeof fetch,
      true,
    );

    const urls = mockFetch.mock.calls.map((call) => String(call[0]));
    expect(urls.filter((url) => url.includes("page=0"))).toHaveLength(1);
    expect(urls.filter((url) => url.includes("page=1"))).toHaveLength(1);
    expect(urls.filter((url) => url.includes("page=2"))).toHaveLength(0);
    expect(campaigns).toHaveLength(101);
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
