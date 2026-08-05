import { type Address } from "viem";

/**
 * Per-institution deployments. The public protocol has one HarborCommand + one AdmiralsQuarters
 * per chain (see CORE_ADDRESSES); every institution instead gets its OWN HarborCommand,
 * AdmiralsQuarters, ConfigurationManager and ProtocolAccessManager. Addresses below were read
 * from the production Goldsky institutions subgraphs and re-verified on-chain on 2026-08-05 -
 * run `scripts/check-institutions.ts` to re-check for drift.
 *
 * There is deliberately NO admiralsQuarters field. Every institutional fleet reports
 * `config().stakingRewardsManager == 0x0`, so there is no staked leg to unwind, and the
 * institutional AdmiralsQuarters deployments do not even implement `unstakeAndWithdrawAssets`
 * (selector absent from all six bytecodes). The exit is therefore a single direct
 * FleetCommander.redeem, and hardcoding an AQ address here would only re-create the staleness
 * problem documented at the top of constants/addresses.ts.
 *
 * Only the HarborCommand is hardcoded - fleets are discovered live via
 * getActiveFleetCommanders(), exactly as the public path does.
 */
export interface Institution {
  /**
   * Institutions-subgraph id, ASCII-decoded from its bytes32 form (0x54617267656e00.. ->
   * "Targen"). Doubles as the display label, so there is one source of truth for the string.
   */
  id: string;
  chainId: number;
  harborCommand: Address;
}

export const INSTITUTIONS: Institution[] = [
  // Arbitrum One - Targen is the one real external client; TarFi_USDC held ~13.2k USDC on 2026-08-05.
  {
    id: "Targen",
    chainId: 42161,
    harborCommand: "0x7fbfb946ca4ba96559467e84ef41da6cfe0c9a17",
  },
  {
    id: "ExtDemoCorp",
    chainId: 42161,
    harborCommand: "0xc78f28a971d466e58e39b2de5da15ec2c4449367",
  },
  // Base
  {
    id: "ExtDemoCorp",
    chainId: 8453,
    harborCommand: "0xa65ba2593d7be9c64c000c93e3cb99c79c1a6241",
  },
  // RWA-wrapped (institutions-v2). The underlying fleets are ordinary FleetCommanders, so
  // directly-held shares stay exitable; funds sitting in an unclaimed ERC-1155 round receipt are
  // out of scope (see README).
  {
    id: "ExtDemoCorp_3",
    chainId: 8453,
    harborCommand: "0x0d65ea35c5c6ed1d423d8ba9ccfc58ad3209647f",
  },
  {
    id: "ExtDemoCorp_v2",
    chainId: 8453,
    harborCommand: "0x43fff3fb7e97b4d2bae41fa899dd0e49be0497c2",
  },
  // Ethereum - also RWA-wrapped.
  {
    id: "Avantgarde",
    chainId: 1,
    harborCommand: "0x330fb246edb7d961ed232b5a68558a68df513206",
  },
];
