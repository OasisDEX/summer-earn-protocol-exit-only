/* Read-only smoke test for the no-lockup SUMR stake-availability read path on Base.
 * Run: npx tsx apps/earn-exit/scripts/check-stake-availability.ts 0xYourAddress
 */
import { type Address, formatUnits } from "viem";

import { getStakeAvailability } from "../lib/stake-availability";

const main = async () => {
  const user = process.argv[2] as Address;

  if (!user?.startsWith("0x"))
    throw new Error("usage: check-stake-availability.ts <address>");

  const { availability, failed } = await getStakeAvailability(user);

  if (failed) {
    console.warn("Base RPC read failed - could not check stake availability.");

    return;
  }

  if (!availability) {
    console.log(`No stake availability could be resolved for ${user}.`);

    return;
  }

  const fmt = (amount: bigint) => formatUnits(amount, availability.sumrDecimals);

  console.log(
    `Wallet balance: ${fmt(availability.walletBalance)} ${availability.sumrSymbol}`,
  );
  console.log(
    `No-lockup bucket headroom: ${fmt(availability.remainingCapacity)} ${availability.sumrSymbol}`,
  );
  console.log(`Max stakeable now: ${fmt(availability.maxStakeable)} ${availability.sumrSymbol}`);
  console.log(`At stake limit: ${availability.atStakeLimit}`);
};

void main();
