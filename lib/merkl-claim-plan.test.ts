import { decodeFunctionData, type Address, type Hex } from "viem";
import { MERKL_DISTRIBUTOR, merklDistributorAbi } from "@/constants/merkl";
import { buildMerklClaimTx } from "./merkl-claim-plan";
import { type MerklClaimableReward } from "./merkl-rewards";

describe("buildMerklClaimTx", () => {
  const user: Address = "0x1111111111111111111111111111111111111111";
  const tokenAddress: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

  const proof1 =
    "0x1234000000000000000000000000000000000000000000000000000000000000" as Hex;
  const proof2 =
    "0x5678000000000000000000000000000000000000000000000000000000000000" as Hex;

  const reward1: MerklClaimableReward = {
    chainId: 8453,
    token: {
      address: tokenAddress,
      symbol: "USDC",
      decimals: 6,
      price: 1.0,
    },
    cumulativeAmount: 5000000n, // 5 USDC cumulative
    claimed: 2000000n, // 2 USDC claimed
    claimableNow: 3000000n, // 3 USDC claimable now
    pending: 0n,
    proofs: [proof1, proof2],
    summerAmount: 5000000n,
    sources: [
      {
        campaignId: "0xCamp1",
        vaultAddress: null,
        amount: 5000000n,
      },
    ],
  };

  it("returns null when there are no claimable rewards (claimableNow === 0)", () => {
    const zeroReward: MerklClaimableReward = {
      ...reward1,
      claimableNow: 0n,
    };
    const tx = buildMerklClaimTx(user, [zeroReward]);
    expect(tx).toBeNull();
  });

  it("throws when claimable rewards span multiple chains", () => {
    const otherChainReward: MerklClaimableReward = {
      ...reward1,
      chainId: 1,
    };
    expect(() => buildMerklClaimTx(user, [reward1, otherChainReward])).toThrow(
      "single chain",
    );
  });

  it("encodes claim calldata with CUMULATIVE amount, not claimableNow", () => {
    const tx = buildMerklClaimTx(user, [reward1]);

    expect(tx).not.toBeNull();
    expect(tx?.to).toBe(MERKL_DISTRIBUTOR);
    expect(tx?.chainId).toBe(8453);
    expect(tx?.value).toBe(0n);

    const decoded = decodeFunctionData({
      abi: merklDistributorAbi,
      data: tx!.data,
    });

    expect(decoded.functionName).toBe("claim");
    const [users, tokens, amounts, proofs] = decoded.args;

    expect(users).toEqual([user]);
    expect(tokens).toEqual([tokenAddress]);
    // CRITICAL: Must be cumulative (5000000n), not claimableNow (3000000n)
    expect(amounts).toEqual([5000000n]);
    expect(proofs).toEqual([[proof1, proof2]]);
  });
});
