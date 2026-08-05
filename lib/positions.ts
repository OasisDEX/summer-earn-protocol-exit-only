import { type Address, erc20Abi } from "viem";

import {
  fleetCommanderAbi,
  harborCommandAbi,
  stakingRewardsManagerAbi,
} from "@/constants/abis";
import { CORE_ADDRESSES, EXTRA_FLEETS } from "@/constants/addresses";
import { SUPPORTED_CHAIN_IDS } from "@/constants/chains";
import { type Institution, INSTITUTIONS } from "@/constants/institutions";
import { getPublicClient } from "@/lib/clients";
import { humanizeFleetName } from "@/lib/fleet-name";
import {
  disambiguateInstitutionNames,
  institutionDisplayName,
} from "@/lib/institution-name";

export interface FleetPosition {
  chainId: number;
  fleetAddress: Address;
  fleetName: string;
  displayName: string;
  asset: { address: Address; symbol: string; decimals: number };
  walletShares: bigint;
  stakedShares: bigint;
  totalShares: bigint;
  totalAssets: bigint;
  stakingRewardsManager: Address | null;
  paused: boolean;
  /**
   * Set for vaults belonging to a per-institution deployment; null for public fleets. Drives the
   * single-redeem exit path and the INSTITUTIONAL tag. There is no separate `label` field - the
   * institution id IS the label, so there is one source of truth for the string.
   */
  institution: { id: string } | null;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Every fleet on the chain: on-chain registry + the hardcoded escape hatch. */
export const getFleetAddresses = async (
  chainId: number,
): Promise<Address[]> => {
  const client = getPublicClient(chainId);
  const active = await client.readContract({
    address: CORE_ADDRESSES[chainId].harborCommand,
    abi: harborCommandAbi,
    functionName: "getActiveFleetCommanders",
  });

  return [...new Set<Address>([...active, ...EXTRA_FLEETS[chainId]])];
};

/**
 * An institution's fleets. EXTRA_FLEETS is deliberately NOT merged in: it is a public-path
 * escape hatch keyed by chainId, and a public fleet address must never surface as an
 * institutional position (it would get the wrong label and the wrong exit route).
 */
const getInstitutionFleetAddresses = async (
  institution: Institution,
): Promise<Address[]> => {
  const client = getPublicClient(institution.chainId);
  const active = await client.readContract({
    address: institution.harborCommand,
    abi: harborCommandAbi,
    functionName: "getActiveFleetCommanders",
  });

  return [...new Set<Address>(active)];
};

const readFleetPositions = async (
  chainId: number,
  user: Address,
  fleets: Address[],
  institution: { id: string } | null,
): Promise<FleetPosition[]> => {
  const client = getPublicClient(chainId);

  if (fleets.length === 0) return [];

  // Round 1: wallet shares + staking manager address, 2 reads per fleet, one multicall.
  const balanceAndConfig = await client.multicall({
    contracts: fleets.flatMap((fleet) => [
      {
        address: fleet,
        abi: fleetCommanderAbi,
        functionName: "balanceOf",
        args: [user],
      } as const,
      {
        address: fleet,
        abi: fleetCommanderAbi,
        functionName: "config",
      } as const,
    ]),
    allowFailure: true,
  });

  const perFleet = fleets.map((fleet, index) => {
    const balanceConfigBase = index * 2;
    const balanceResult = balanceAndConfig[balanceConfigBase];
    const configResult = balanceAndConfig[balanceConfigBase + 1];
    const walletShares =
      balanceResult.status === "success"
        ? (balanceResult.result as bigint)
        : 0n;
    // config() returns a 5-tuple; the 5th entry is the staking rewards manager.
    const stakingRewardsManager =
      configResult.status === "success"
        ? ((
            configResult.result as readonly [
              Address,
              bigint,
              bigint,
              bigint,
              Address,
            ]
          )[4] as Address)
        : (ZERO_ADDRESS as Address);

    return { fleet, walletShares, stakingRewardsManager };
  });

  // Round 2: staked shares for fleets that have a staking module.
  const withStaking = perFleet.filter(
    (entry) => entry.stakingRewardsManager.toLowerCase() !== ZERO_ADDRESS,
  );
  const stakedResults =
    withStaking.length > 0
      ? await client.multicall({
          contracts: withStaking.map(
            (entry) =>
              ({
                address: entry.stakingRewardsManager,
                abi: stakingRewardsManagerAbi,
                functionName: "balanceOf",
                args: [user],
              }) as const,
          ),
          allowFailure: true,
        })
      : [];

  const stakedByFleet = new Map<Address, bigint>(
    withStaking.map((entry, index) => [
      entry.fleet,
      stakedResults[index]?.status === "success"
        ? (stakedResults[index].result as bigint)
        : 0n,
    ]),
  );

  const candidates = perFleet
    .map((entry) => ({
      ...entry,
      stakedShares: stakedByFleet.get(entry.fleet) ?? 0n,
    }))
    .filter((entry) => entry.walletShares + entry.stakedShares > 0n);

  if (candidates.length === 0) return [];

  // Round 3: metadata + share->asset conversion for actual positions only.
  // allowFailure so one broken/decommissioned fleet (e.g. an EXTRA_FLEETS entry that reverts on a
  // view) drops out of the results instead of hiding every position on the chain - this is a
  // wind-down safety app, so a single bad fleet must never mask a user's other exitable positions.
  const metadata = await client.multicall({
    contracts: candidates.flatMap((entry) => {
      const totalShares = entry.walletShares + entry.stakedShares;

      return [
        {
          address: entry.fleet,
          abi: fleetCommanderAbi,
          functionName: "name",
        } as const,
        {
          address: entry.fleet,
          abi: fleetCommanderAbi,
          functionName: "asset",
        } as const,
        {
          address: entry.fleet,
          abi: fleetCommanderAbi,
          functionName: "convertToAssets",
          args: [totalShares],
        } as const,
        {
          address: entry.fleet,
          abi: fleetCommanderAbi,
          functionName: "paused",
        } as const,
      ];
    }),
    allowFailure: true,
  });

  const assetAddresses = candidates.map((entry, index) => {
    const metadataBase = index * 4;
    const assetResult = metadata[metadataBase + 1]; // name, asset, convertToAssets, paused → asset is slot +1

    return assetResult.status === "success"
      ? (assetResult.result as Address)
      : null;
  });

  const assetMetadata = await client.multicall({
    contracts: assetAddresses.flatMap((assetAddress) =>
      assetAddress === null
        ? []
        : [
            {
              address: assetAddress,
              abi: erc20Abi,
              functionName: "symbol",
            } as const,
            {
              address: assetAddress,
              abi: erc20Abi,
              functionName: "decimals",
            } as const,
          ],
    ),
    allowFailure: true,
  });

  // assetMetadata is packed only for candidates whose asset() succeeded; walk it with a cursor
  // that advances 2 slots per resolved asset, in the same candidate order.
  let assetMetadataCursor = 0;

  return candidates
    .map((entry, index): FleetPosition | null => {
      const metadataBase = index * 4;
      const nameResult = metadata[metadataBase];
      const assetAddress = assetAddresses[index];
      const totalAssetsResult = metadata[metadataBase + 2];
      const pausedResult = metadata[metadataBase + 3];

      // This candidate's asset() reverted: no slots were emitted for it in assetMetadata.
      if (assetAddress === null) return null;

      const symbolResult = assetMetadata[assetMetadataCursor];
      const decimalsResult = assetMetadata[assetMetadataCursor + 1];

      assetMetadataCursor += 2;

      // Drop the fleet if any read it needs to be exitable/displayable failed.
      if (
        nameResult.status !== "success" ||
        totalAssetsResult.status !== "success" ||
        symbolResult.status !== "success" ||
        decimalsResult.status !== "success"
      ) {
        return null;
      }

      const fleetName = nameResult.result as string;

      return {
        chainId,
        fleetAddress: entry.fleet,
        fleetName,
        displayName: institution
          ? institutionDisplayName(institution.id, symbolResult.result as string)
          : humanizeFleetName(chainId, fleetName),
        asset: {
          address: assetAddress,
          symbol: symbolResult.result as string,
          decimals: Number(decimalsResult.result),
        },
        walletShares: entry.walletShares,
        stakedShares: entry.stakedShares,
        totalShares: entry.walletShares + entry.stakedShares,
        totalAssets: totalAssetsResult.result as bigint,
        stakingRewardsManager:
          entry.stakingRewardsManager.toLowerCase() === ZERO_ADDRESS
            ? null
            : entry.stakingRewardsManager,
        // Fail safe to "not paused" on a bad read rather than hiding an otherwise exitable position.
        paused:
          pausedResult.status === "success"
            ? (pausedResult.result as boolean)
            : false,
        institution,
      };
    })
    .filter((position): position is FleetPosition => position !== null);
};

export const getPositionsForChain = async (
  chainId: number,
  user: Address,
): Promise<FleetPosition[]> =>
  readFleetPositions(chainId, user, await getFleetAddresses(chainId), null);

export const getInstitutionPositions = async (
  institution: Institution,
  user: Address,
): Promise<FleetPosition[]> =>
  readFleetPositions(
    institution.chainId,
    user,
    await getInstitutionFleetAddresses(institution),
    { id: institution.id },
  );

/**
 * All public chains and all institutions in parallel; one failing RPC or HarborCommand never
 * hides the others' positions.
 */
export const getAllPositions = async (
  user: Address,
): Promise<{ positions: FleetPosition[]; failedChainIds: number[] }> => {
  const tasks: { chainId: number; run: () => Promise<FleetPosition[]> }[] = [
    ...SUPPORTED_CHAIN_IDS.map((chainId) => ({
      chainId,
      run: () => getPositionsForChain(chainId, user),
    })),
    ...INSTITUTIONS.map((institution) => ({
      chainId: institution.chainId,
      run: () => getInstitutionPositions(institution, user),
    })),
  ];

  const results = await Promise.allSettled(tasks.map((task) => task.run()));

  const positions: FleetPosition[] = [];
  // A Set because an institution and its chain's public path share a chainId: if only the
  // institution's read failed the banner still names the chain. Over-warning is the correct bias
  // for a wind-down app - silently omitting an exitable position is not.
  const failedChainIds = new Set<number>();

  results.forEach((result, index) => {
    if (result.status === "fulfilled") positions.push(...result.value);
    else failedChainIds.add(tasks[index].chainId);
  });

  // Applied once, across every chain and institution, so a label collision that spans two
  // readFleetPositions calls is still caught.
  return {
    positions: disambiguateInstitutionNames(positions),
    failedChainIds: [...failedChainIds],
  };
};
