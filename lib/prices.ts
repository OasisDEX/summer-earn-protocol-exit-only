import { formatUnits } from "viem";

import { chainlinkAggregatorAbi } from "@/constants/abis";
import { CHAINLINK_FEEDS } from "@/constants/addresses";
import { getPublicClient } from "@/lib/clients";
import { type FleetPosition } from "@/lib/positions";

export interface UsdPrices {
  eth: number | null;
  eur: number | null;
  usdc: number | null;
  usdt: number | null;
}

// Every symbol actually used as a fleet input asset. Public fleets were confirmed by a one-time
// scan (that script has since been removed from the repo); institutional fleets were not part of
// that scan, but every one deployed so far uses USDC, so this list still covers everything the
// app can surface. Revisit if an institutional fleet ever launches on a different asset. USD₮0
// (Arbitrum/Hyperliquid Tether) has no feed of its own and rides the USDT/USD feed - it's
// Tether's own asset, just deployed under a different symbol.
const USDC_SYMBOLS = new Set(["USDC"]);
const USDT_SYMBOLS = new Set(["USDT", "USD₮0"]);
const ETH_SYMBOLS = new Set(["ETH", "WETH"]);
const EUR_SYMBOLS = new Set(["EURC"]);

const readFeed = async (feed: `0x${string}`): Promise<number | null> => {
  try {
    const client = getPublicClient(1); // both feeds live on mainnet

    const [roundData, decimals] = await Promise.all([
      client.readContract({
        address: feed,
        abi: chainlinkAggregatorAbi,
        functionName: "latestRoundData",
      }),
      client.readContract({
        address: feed,
        abi: chainlinkAggregatorAbi,
        functionName: "decimals",
      }),
    ]);

    return Number(formatUnits(roundData[1], decimals));
  } catch {
    return null; // USD display is cosmetic - never let a feed failure break the page
  }
};

export const getUsdPrices = async (): Promise<UsdPrices> => {
  const [eth, eur, usdc, usdt] = await Promise.all([
    readFeed(CHAINLINK_FEEDS.ETH_USD),
    readFeed(CHAINLINK_FEEDS.EUR_USD),
    readFeed(CHAINLINK_FEEDS.USDC_USD),
    readFeed(CHAINLINK_FEEDS.USDT_USD),
  ]);

  return { eth, eur, usdc, usdt };
};

export const estimateUsdValue = (
  position: FleetPosition,
  prices: UsdPrices,
): number | null => {
  const amount = Number(
    formatUnits(position.totalAssets, position.asset.decimals),
  );
  const symbol = position.asset.symbol.toUpperCase();

  // Feed failure falls back to the 1:1 peg rather than hiding the value entirely - a stablecoin
  // trading a fraction off $1 is still ~$1 for display purposes when the feed is unreachable.
  if (USDC_SYMBOLS.has(symbol)) return amount * (prices.usdc ?? 1);
  if (USDT_SYMBOLS.has(symbol)) return amount * (prices.usdt ?? 1);
  if (ETH_SYMBOLS.has(symbol) && prices.eth !== null)
    return amount * prices.eth;
  if (EUR_SYMBOLS.has(symbol) && prices.eur !== null)
    return amount * prices.eur;

  return null;
};
