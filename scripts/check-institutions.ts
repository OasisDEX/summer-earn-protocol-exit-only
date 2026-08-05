/* Run: npx tsx scripts/check-institutions.ts */
import { erc20Abi, formatUnits, hexToString, type Address } from 'viem'

import { fleetCommanderAbi, harborCommandAbi } from '../constants/abis'
import { CORE_ADDRESSES } from '../constants/addresses'
import { SUPPORTED_CHAIN_IDS } from '../constants/chains'
import { INSTITUTIONS } from '../constants/institutions'
import { getPublicClient } from '../lib/clients'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// Production Goldsky endpoints. Dev-time only - the shipped app never calls a subgraph.
const SUBGRAPHS: { chainId: number; url: string }[] = [
  { chainId: 1, url: 'summer-institutions/1.2.0-deep-cleanup' },
  { chainId: 42161, url: 'summer-institutions-arbitrum/1.2.0-deep-cleanup' },
  { chainId: 8453, url: 'summer-institutions-base/1.2.0-deep-cleanup' },
  { chainId: 1, url: 'summer-institutions-v2/0.3.7' },
  { chainId: 8453, url: 'summer-institutions-v2-base/0.4.0' },
].map(({ chainId, url }) => ({
  chainId,
  url: `https://api.goldsky.com/api/public/project_cmgyeezx300294yp2bgo8cfjo/subgraphs/${url}/gn`,
}))

const QUERY = '{ institutions(first: 100) { id active harborCommand } }'

/** bytes32 ASCII id -> "Targen". Right-padded with NULs, which must be stripped. */
const decodeInstitutionId = (id: string) => hexToString(id as `0x${string}`).replace(/\0+$/u, '')

const fetchSubgraphInstitutions = async () => {
  const found = new Map<string, { id: string; chainId: number; harborCommand: string }>()

  for (const { chainId, url } of SUBGRAPHS) {
    let payload: { data?: { institutions?: { id: string; active: boolean; harborCommand: string }[] } }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: QUERY }),
      })

      payload = await response.json()
    } catch (error) {
      console.warn(`! subgraph unreachable, skipping: ${url}\n  ${String(error)}`)
      continue
    }

    for (const institution of payload.data?.institutions ?? []) {
      if (!institution.active) continue

      const id = decodeInstitutionId(institution.id)
      // ExtDemoCorp_3 is indexed by BOTH the v1 and v2 subgraphs with the same deployment;
      // key by id+chain so it collapses to one entry rather than looking like a duplicate.
      found.set(`${id}-${chainId}`, {
        id,
        chainId,
        harborCommand: institution.harborCommand.toLowerCase(),
      })
    }
  }

  return found
}

const diffAgainstConstant = (subgraph: Awaited<ReturnType<typeof fetchSubgraphInstitutions>>) => {
  let drifted = false

  if (subgraph.size === 0) {
    console.warn('! no subgraph data reached - drift check skipped, on-chain checks still ran')

    return false
  }

  const hardcoded = new Map(
    INSTITUTIONS.map((institution) => [`${institution.id}-${institution.chainId}`, institution]),
  )

  for (const [key, live] of subgraph) {
    const local = hardcoded.get(key)

    if (!local) {
      console.error(`DRIFT: ${key} is active on-chain but MISSING from INSTITUTIONS (${live.harborCommand})`)
      drifted = true
    } else if (local.harborCommand.toLowerCase() !== live.harborCommand) {
      console.error(
        `DRIFT: ${key} HarborCommand changed - constant ${local.harborCommand}, subgraph ${live.harborCommand}`,
      )
      drifted = true
    }
  }

  for (const key of hardcoded.keys()) {
    if (!subgraph.has(key)) {
      console.error(`DRIFT: ${key} is in INSTITUTIONS but no longer active in the subgraph`)
      drifted = true
    }
  }

  return drifted
}

/**
 * The script's own drift-check map (fetchSubgraphInstitutions / diffAgainstConstant) keys by
 * `${id}-${chainId}`: a duplicate INSTITUTIONS entry for the same key would silently vanish from
 * that walk instead of surfacing as a failure. constants/institutions.test.ts only asserts unique
 * `harborCommand`, which would not catch this either.
 */
const checkDuplicateInstitutionKeys = (): boolean => {
  const seen = new Set<string>()
  let duplicated = false

  for (const institution of INSTITUTIONS) {
    const key = `${institution.id}-${institution.chainId}`

    if (seen.has(key)) {
      console.error(`ASSERTION FAILED: duplicate INSTITUTIONS entry for ${key}`)
      duplicated = true
    }

    seen.add(key)
  }

  return duplicated
}

/**
 * No fleet may be registered under both a chain's public HarborCommand and any institutional
 * HarborCommand: if one were, a wallet's shares would surface as two cards with two different
 * exit routes for the same money - double-counted, and each route would race the other's redeem.
 */
const checkNoPublicInstitutionalOverlap = async (
  institutionalFleets: Map<string, { institutionId: string; fleet: Address }>,
): Promise<boolean> => {
  let overlapped = false

  for (const chainId of SUPPORTED_CHAIN_IDS) {
    const client = getPublicClient(chainId)
    const publicFleets = (await client.readContract({
      address: CORE_ADDRESSES[chainId].harborCommand,
      abi: harborCommandAbi,
      functionName: 'getActiveFleetCommanders',
    })) as Address[]

    for (const fleet of publicFleets) {
      const key = `${chainId}-${fleet.toLowerCase()}`
      const institutional = institutionalFleets.get(key)

      if (institutional) {
        console.error(
          `ASSERTION FAILED: fleet ${fleet} on chain ${chainId} is registered under BOTH the`,
          `public HarborCommand and ${institutional.institutionId}'s institutional HarborCommand -`,
          'a wallet holding shares here would see it as two positions with two exit routes.',
        )
        overlapped = true
      }
    }
  }

  return overlapped
}

const main = async () => {
  const drifted = diffAgainstConstant(await fetchSubgraphInstitutions())
  const duplicateInstitutions = checkDuplicateInstitutionKeys()
  const institutionalFleets = new Map<string, { institutionId: string; fleet: Address }>()
  let stakingFound = false

  for (const institution of INSTITUTIONS) {
    const client = getPublicClient(institution.chainId)

    console.log(`\n=== ${institution.id} @ chain ${institution.chainId} ===`)

    const fleets = await client.readContract({
      address: institution.harborCommand,
      abi: harborCommandAbi,
      functionName: 'getActiveFleetCommanders',
    })

    console.log(`  HarborCommand ${institution.harborCommand} -> ${fleets.length} active fleet(s)`)

    for (const fleet of fleets as Address[]) {
      institutionalFleets.set(`${institution.chainId}-${fleet.toLowerCase()}`, {
        institutionId: institution.id,
        fleet,
      })

      const [name, asset, config, paused, totalAssets] = await Promise.all([
        client.readContract({ address: fleet, abi: fleetCommanderAbi, functionName: 'name' }),
        client.readContract({ address: fleet, abi: fleetCommanderAbi, functionName: 'asset' }),
        client.readContract({ address: fleet, abi: fleetCommanderAbi, functionName: 'config' }),
        client.readContract({ address: fleet, abi: fleetCommanderAbi, functionName: 'paused' }),
        client.readContract({ address: fleet, abi: fleetCommanderAbi, functionName: 'totalAssets' }),
      ])
      const [symbol, decimals] = await Promise.all([
        client.readContract({ address: asset, abi: erc20Abi, functionName: 'symbol' }),
        client.readContract({ address: asset, abi: erc20Abi, functionName: 'decimals' }),
      ])
      const stakingRewardsManager = config[4]

      console.log(
        `  ${fleet} "${name}" ${formatUnits(totalAssets, decimals)} ${symbol} paused=${paused}`,
      )

      if (stakingRewardsManager.toLowerCase() !== ZERO_ADDRESS) {
        console.error(
          `  ASSERTION FAILED: ${fleet} has a stakingRewardsManager (${stakingRewardsManager}).`,
          '\n  The single-step institutional exit assumes there is no staked leg. This fleet needs',
          "\n  the institution's AdmiralsQuarters and an unstakeAndWithdrawAssets call.",
        )
        stakingFound = true
      }
    }
  }

  const overlapped = await checkNoPublicInstitutionalOverlap(institutionalFleets)

  if (drifted || stakingFound || duplicateInstitutions || overlapped) {
    console.error('\nFAILED - see the DRIFT / ASSERTION lines above.')
    process.exitCode = 1
  } else {
    console.log(
      '\nOK - constants match the subgraph, no institutional fleet has a staking module, no',
      'duplicate INSTITUTIONS entries, and no fleet is registered under both a public and an',
      'institutional HarborCommand.',
    )
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
