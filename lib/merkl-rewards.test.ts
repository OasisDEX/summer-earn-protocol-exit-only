import { getMerklRewards } from "./merkl-rewards";
import { type SummerMerklCampaign } from "./merkl-discovery";

describe("getMerklRewards", () => {
  const user = "0x1111111111111111111111111111111111111111";

  const campaign1: SummerMerklCampaign = {
    campaignId: "0xCamp1",
    computeChainId: 8453,
    distributionChainId: 8453,
    rewardToken: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      decimals: 6,
      chainId: 8453,
    },
    vaultAddress: "0xVaultA",
    opportunityName: "Deposit USDC on Summer Finance (lower risk)",
    startTimestamp: 1000,
    endTimestamp: 2000,
  };

  it("returns empty rewards when no campaigns provided or no user", async () => {
    const res = await getMerklRewards(user, []);
    expect(res).toEqual({ rewards: [], failedChainIds: [] });
  });

  it("parses user rewards and attributes to Summer campaigns", async () => {
    const mockApiResponse = [
      {
        chain: { id: 8453, name: "Base" },
        rewards: [
          {
            root: "0xRoot",
            recipient: user,
            amount: "1000000",
            claimed: "200000",
            pending: "50000",
            proofs: ["0xProof1", "0xProof2"],
            token: {
              address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              chainId: 8453,
              symbol: "USDC",
              decimals: 6,
              price: 1.0,
            },
            breakdowns: [
              {
                campaignId: "0xCamp1",
                amount: "1000000",
              },
              {
                campaignId: "0xOtherCamp",
                amount: "500000",
              },
            ],
          },
        ],
      },
    ];

    const mockFetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      } as Response),
    );

    const { rewards, failedChainIds } = await getMerklRewards(user, [campaign1], {
      fetcher: mockFetch as unknown as typeof fetch,
    });

    expect(failedChainIds).toEqual([]);
    expect(rewards).toHaveLength(1);

    const r = rewards[0];
    expect(r.chainId).toBe(8453);
    expect(r.token.symbol).toBe("USDC");
    expect(r.cumulativeAmount).toBe(1000000n);
    expect(r.claimed).toBe(200000n);
    expect(r.claimableNow).toBe(800000n);
    expect(r.pending).toBe(50000n);
    expect(r.summerAmount).toBe(1000000n);
    expect(r.sources).toEqual([
      {
        campaignId: "0xCamp1",
        vaultAddress: "0xVaultA",
        opportunityName: "Deposit USDC on Summer Finance (lower risk)",
        amount: 1000000n,
      },
    ]);
  });

  it("filters out rewards with no Summer breakdowns", async () => {
    const mockApiResponse = [
      {
        chain: { id: 8453, name: "Base" },
        rewards: [
          {
            root: "0xRoot",
            recipient: user,
            amount: "1000000",
            claimed: "0",
            pending: "0",
            proofs: [],
            token: {
              address: "0xToken",
              chainId: 8453,
              symbol: "XYZ",
              decimals: 18,
            },
            breakdowns: [{ campaignId: "0xUnrelated", amount: "1000000" }],
          },
        ],
      },
    ];

    const mockFetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      } as Response),
    );

    const { rewards } = await getMerklRewards(user, [campaign1], {
      fetcher: mockFetch as unknown as typeof fetch,
    });

    expect(rewards).toHaveLength(0);
  });

  it("queries every chain passed via options.chainIds", async () => {
    const urls: string[] = [];
    const mockFetch = jest.fn((url: string) => {
      urls.push(url);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    });

    await getMerklRewards(user, [campaign1], {
      chainIds: [8453, 1, 42161],
      fetcher: mockFetch as unknown as typeof fetch,
    });
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain("chainId=8453");
    expect(urls[1]).toContain("chainId=1");
    expect(urls[2]).toContain("chainId=42161");
  });

  it("isolates chain failures and records failedChainIds", async () => {
    const mockFetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
      } as Response),
    );

    const { rewards, failedChainIds } = await getMerklRewards(user, [campaign1], {
      fetcher: mockFetch as unknown as typeof fetch,
    });

    expect(rewards).toEqual([]);
    expect(failedChainIds).toEqual([8453]);
  });
});
