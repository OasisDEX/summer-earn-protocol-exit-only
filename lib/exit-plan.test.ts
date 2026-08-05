import { decodeFunctionData, type Hex } from "viem";

import {
  admiralsQuartersAbi,
  fleetCommanderAbi,
  stakingRewardsManagerAbi,
} from "@/constants/abis";
import { CORE_ADDRESSES } from "@/constants/addresses";

import { buildExitPlan } from "./exit-plan";
import { type FleetPosition } from "./positions";

// Doc's literal address failed viem's EIP-55 checksum validation (typo'd casing); using the
// correctly checksummed form of the same address - see phase-4 report for details.
const FLEET = "0x98C49e13bf99D7CAd8069faa2A370933EC9EcF17" as const;
const RM = "0x1111111111111111111111111111111111111111" as const;
const USER = "0x2222222222222222222222222222222222222222" as const;
const AQ = CORE_ADDRESSES[8453].admiralsQuarters;

const basePosition: FleetPosition = {
  chainId: 8453,
  fleetAddress: FLEET,
  fleetName: "LazyVault_LowerRisk_USDC",
  displayName: "USDC Base Lower Risk",
  asset: {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    symbol: "USDC",
    decimals: 6,
  },
  walletShares: 0n,
  stakedShares: 0n,
  totalShares: 0n,
  totalAssets: 0n,
  stakingRewardsManager: RM,
  paused: false,
  institution: null,
};

const decodeMulticall = (data: Hex) => {
  const outer = decodeFunctionData({ abi: admiralsQuartersAbi, data });

  expect(outer.functionName).toBe("multicall");

  return (outer.args[0] as Hex[]).map((inner) =>
    decodeFunctionData({ abi: admiralsQuartersAbi, data: inner }),
  );
};

describe("buildExitPlan", () => {
  it("wallet shares only, insufficient allowance -> [approve, exit(exitFleet+withdrawTokens)]", () => {
    const plan = buildExitPlan({
      position: { ...basePosition, walletShares: 100n, totalShares: 100n },
      user: USER,
      allowance: 0n,
      hasClaimableRewards: false,
      maxRedeem: 0n,
    });

    expect(plan.map((step) => step.type)).toEqual(["approve", "exit"]);

    const approve = decodeFunctionData({
      abi: fleetCommanderAbi,
      data: plan[0].tx.data,
    });

    expect(plan[0].tx.to).toBe(FLEET);
    expect(approve.functionName).toBe("approve");
    expect(approve.args).toEqual([AQ, 100n]);

    expect(plan[1].tx.to).toBe(AQ);
    const inner = decodeMulticall(plan[1].tx.data);

    expect(inner.map((call) => call.functionName)).toEqual([
      "exitFleet",
      "withdrawTokens",
    ]);
    expect(inner[0].args).toEqual([FLEET, 0n]);
    expect(inner[1].args).toEqual([basePosition.asset.address, 0n]);
  });

  it("sufficient allowance -> approve skipped", () => {
    const plan = buildExitPlan({
      position: { ...basePosition, walletShares: 100n, totalShares: 100n },
      user: USER,
      allowance: 100n,
      hasClaimableRewards: false,
      maxRedeem: 0n,
    });

    expect(plan.map((step) => step.type)).toEqual(["exit"]);
  });

  it("wallet + staked -> multicall carries all three calls in SDK order", () => {
    const plan = buildExitPlan({
      position: {
        ...basePosition,
        walletShares: 100n,
        stakedShares: 50n,
        totalShares: 150n,
      },
      user: USER,
      allowance: 0n,
      hasClaimableRewards: true, // staked leg claims via claimRewards=true -> no claim step
      maxRedeem: 0n,
    });

    expect(plan.map((step) => step.type)).toEqual(["approve", "exit"]);
    const inner = decodeMulticall(plan[1].tx.data);

    expect(inner.map((call) => call.functionName)).toEqual([
      "exitFleet",
      "withdrawTokens",
      "unstakeAndWithdrawAssets",
    ]);
    expect(inner[2].args).toEqual([FLEET, 0n, true]);
  });

  it("staked only -> single multicall(unstakeAndWithdrawAssets), no approve", () => {
    const plan = buildExitPlan({
      position: { ...basePosition, stakedShares: 50n, totalShares: 50n },
      user: USER,
      allowance: 0n,
      hasClaimableRewards: false,
      maxRedeem: 0n,
    });

    expect(plan.map((step) => step.type)).toEqual(["exit"]);
    const inner = decodeMulticall(plan[0].tx.data);

    expect(inner.map((call) => call.functionName)).toEqual([
      "unstakeAndWithdrawAssets",
    ]);
  });

  it("leftover rewards with zero staked shares -> claim step appended", () => {
    const plan = buildExitPlan({
      position: { ...basePosition, walletShares: 100n, totalShares: 100n },
      user: USER,
      allowance: 100n,
      hasClaimableRewards: true,
      maxRedeem: 0n,
    });

    expect(plan.map((step) => step.type)).toEqual(["exit", "claim"]);
    expect(plan[1].tx.to).toBe(RM);

    const claim = decodeFunctionData({
      abi: stakingRewardsManagerAbi,
      data: plan[1].tx.data,
    });

    expect(claim.functionName).toBe("getReward");
  });

  it("every tx carries the position chainId and zero value", () => {
    const plan = buildExitPlan({
      position: {
        ...basePosition,
        walletShares: 1n,
        stakedShares: 1n,
        totalShares: 2n,
      },
      user: USER,
      allowance: 0n,
      hasClaimableRewards: false,
      maxRedeem: 0n,
    });

    for (const step of plan) {
      expect(step.tx.chainId).toBe(8453);
      expect(step.tx.value).toBe(0n);
    }
  });

  describe("institutional positions", () => {
    const institutionalPosition: FleetPosition = {
      ...basePosition,
      fleetName: "TarFi_USDC",
      displayName: "Targen USDC",
      institution: { id: "Targen" },
      // Verified on-chain: no institutional fleet has a staking module.
      stakingRewardsManager: null,
      walletShares: 100n,
      stakedShares: 0n,
      totalShares: 100n,
    };

    it("is a single direct redeem on the fleet - no approve, no AdmiralsQuarters", () => {
      const plan = buildExitPlan({
        position: institutionalPosition,
        user: USER,
        allowance: 0n,
        hasClaimableRewards: false,
        maxRedeem: 100n,
      });

      expect(plan.map((step) => step.type)).toEqual(["exit"]);
      expect(plan[0].tx.to).toBe(FLEET);
      expect(plan[0].tx.to).not.toBe(AQ);

      const redeem = decodeFunctionData({
        abi: fleetCommanderAbi,
        data: plan[0].tx.data,
      });

      expect(redeem.functionName).toBe("redeem");
      expect(redeem.args).toEqual([100n, USER, USER]);
      // Boundary: maxRedeem === walletShares - a full, uncapped exit.
      expect(plan[0].label).toBe("Withdraw all USDC");
      expect(plan[0].capped).toBe(false);
    });

    it("caps the redeem at maxRedeem and says so in the label", () => {
      const plan = buildExitPlan({
        position: institutionalPosition,
        user: USER,
        allowance: 0n,
        hasClaimableRewards: false,
        maxRedeem: 60n,
      });

      const redeem = decodeFunctionData({
        abi: fleetCommanderAbi,
        data: plan[0].tx.data,
      });

      expect(redeem.args).toEqual([60n, USER, USER]);
      expect(plan[0].label).toContain("liquidity");
      expect(plan[0].capped).toBe(true);
    });

    it("uses the full balance when maxRedeem exceeds it", () => {
      const plan = buildExitPlan({
        position: institutionalPosition,
        user: USER,
        allowance: 0n,
        hasClaimableRewards: false,
        maxRedeem: 500n,
      });

      const redeem = decodeFunctionData({
        abi: fleetCommanderAbi,
        data: plan[0].tx.data,
      });

      expect(redeem.args).toEqual([100n, USER, USER]);
      expect(plan[0].label).not.toContain("liquidity");
      expect(plan[0].capped).toBe(false);
    });

    it("ceilings the redeem at walletShares, not totalShares, when a staked leg exists", () => {
      // Structurally impossible today (every institutional fleet has stakingRewardsManager ==
      // 0x0, so stakedShares is always 0n) but pins the fix: a DIRECT redeem can only ever pull
      // from the wallet-held shares, never the staked leg, regardless of what maxRedeem allows.
      const plan = buildExitPlan({
        position: {
          ...institutionalPosition,
          walletShares: 80n,
          stakedShares: 20n,
          totalShares: 100n,
        },
        user: USER,
        allowance: 0n,
        hasClaimableRewards: false,
        maxRedeem: 1000n, // exceeds both walletShares and totalShares
      });

      const redeem = decodeFunctionData({
        abi: fleetCommanderAbi,
        data: plan[0].tx.data,
      });

      expect(redeem.args).toEqual([80n, USER, USER]);
      expect(plan[0].label).not.toContain("liquidity");
      expect(plan[0].capped).toBe(false);
    });

    it("still detects a liquidity cap relative to walletShares when a staked leg exists", () => {
      const plan = buildExitPlan({
        position: {
          ...institutionalPosition,
          walletShares: 80n,
          stakedShares: 20n,
          totalShares: 100n,
        },
        user: USER,
        allowance: 0n,
        hasClaimableRewards: false,
        maxRedeem: 50n,
      });

      const redeem = decodeFunctionData({
        abi: fleetCommanderAbi,
        data: plan[0].tx.data,
      });

      expect(redeem.args).toEqual([50n, USER, USER]);
      expect(plan[0].label).toContain("liquidity");
      expect(plan[0].capped).toBe(true);
    });

    it("exposes `capped` as a structural flag the UI can use instead of string-matching the label", () => {
      const fullPlan = buildExitPlan({
        position: institutionalPosition,
        user: USER,
        allowance: 0n,
        hasClaimableRewards: false,
        maxRedeem: 500n,
      });
      const partialPlan = buildExitPlan({
        position: institutionalPosition,
        user: USER,
        allowance: 0n,
        hasClaimableRewards: false,
        maxRedeem: 60n,
      });

      expect(fullPlan[0].capped).toBe(false);
      expect(partialPlan[0].capped).toBe(true);
    });

    it("yields an empty plan when nothing can be redeemed", () => {
      expect(
        buildExitPlan({
          position: institutionalPosition,
          user: USER,
          allowance: 0n,
          hasClaimableRewards: false,
          maxRedeem: 0n,
        }),
      ).toEqual([]);
    });

    it("ignores hasClaimableRewards - institutional fleets have no rewards manager", () => {
      const plan = buildExitPlan({
        position: institutionalPosition,
        user: USER,
        allowance: 0n,
        hasClaimableRewards: true,
        maxRedeem: 100n,
      });

      expect(plan.map((step) => step.type)).toEqual(["exit"]);
    });

    it("carries the position chainId and zero value", () => {
      const plan = buildExitPlan({
        position: institutionalPosition,
        user: USER,
        allowance: 0n,
        hasClaimableRewards: false,
        maxRedeem: 100n,
      });

      // Compared against the fixture's own chainId, not the literal 8453, so a hardcoded chain
      // id in the implementation would fail this even though 8453 happens to be the fixture's
      // value too.
      expect(plan[0].tx.chainId).toBe(institutionalPosition.chainId);
      expect(plan[0].tx.value).toBe(0n);
    });
  });
});
