import { type Address } from "viem";

/**
 * Structural subset of FleetPosition. Declared locally rather than imported so this module stays
 * a leaf - lib/positions.ts imports it, and importing back would be a cycle.
 */
export interface NameableInstitutionPosition {
  fleetAddress: Address;
  displayName: string;
  institution: { id: string } | null;
}

/**
 * "Targen" + "USDC" -> "Targen USDC". Mirrors getInstiVaultNiceName in the monorepo's
 * earn-protocol-institutions app, minus the network: the chain is already conveyed by
 * TokenWithNetworkIcon on the position card, so repeating it in the text is noise.
 *
 * Institutional fleet names do NOT follow the public LazyVault_<risk>_<symbol> convention, so
 * humanizeFleetName mangles them ("TarFi_USDC" on Arbitrum -> "USDC Arbitrum TarFi"). Hence a
 * separate function rather than a special case in there.
 */
export const institutionDisplayName = (
  institutionId: string,
  symbol: string,
): string => `${institutionId} ${symbol}`;

const shortenAddress = (address: Address): string =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

/**
 * Appends a shortened fleet address to any INSTITUTIONAL label that appears more than once in
 * `positions`, so no two cards are indistinguishable. Two real cases need this: ExtDemoCorp_3
 * owns two fleets whose on-chain name() is identical, and ExtDemoCorp has same-asset fleets on
 * two different chains. Labels used exactly once are left clean, and public positions are never
 * rewritten - their names come from humanizeFleetName and are already unique.
 *
 * Must be applied across the FULL result set, not per chain or per institution, or the
 * cross-chain collision is invisible.
 */
export const disambiguateInstitutionNames = <
  T extends NameableInstitutionPosition,
>(
  positions: T[],
): T[] => {
  const counts = new Map<string, number>();

  for (const position of positions) {
    if (!position.institution) continue;

    counts.set(position.displayName, (counts.get(position.displayName) ?? 0) + 1);
  }

  return positions.map((position) => {
    if (!position.institution) return position;
    if ((counts.get(position.displayName) ?? 0) < 2) return position;

    return {
      ...position,
      displayName: `${position.displayName} (${shortenAddress(position.fleetAddress)})`,
    };
  });
};
