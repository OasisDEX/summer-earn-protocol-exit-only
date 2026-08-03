"use client";

import { type FC } from "react";
import { Button, Card, Text, TokenWithNetworkIcon } from "@/components/ui";
import {
  type SupportedNetworkIds,
  type TokenSymbolsList,
} from "@/components/ui";
import { formatCryptoBalance } from "@/lib/format";
import { formatUnits } from "viem";

import { type StakeAvailability } from "@/lib/stake-availability";

import classNames from "./StakeSumrCard.module.css";

interface StakeSumrCardProps {
  availability: StakeAvailability;
  /** Undefined ⇒ read-only (viewing someone else's wallet): the action is disabled. */
  onStake?: () => void;
}

export const StakeSumrCard: FC<StakeSumrCardProps> = ({
  availability,
  onStake,
}) => {
  const {
    sumrSymbol,
    sumrDecimals,
    chainId,
    walletBalance,
    remainingCapacity,
    maxStakeable,
    atStakeLimit,
  } = availability;
  const format = (amount: bigint) =>
    formatCryptoBalance(formatUnits(amount, sumrDecimals));

  const capacityMessage = atStakeLimit
    ? "You've reached the maximum number of stakes"
    : remainingCapacity === 0n
      ? "No-lockup bucket is at capacity"
      : `No-lockup capacity left: ${format(remainingCapacity)} ${sumrSymbol}`;

  return (
    <Card variant="cardSecondary" className={classNames.card}>
      <div className={classNames.header}>
        <div className={classNames.titleBlock}>
          <TokenWithNetworkIcon
            tokenName={sumrSymbol as TokenSymbolsList}
            chainId={chainId as SupportedNetworkIds}
            variant="medium"
          />
          <div>
            <Text
              as="p"
              variant="p1semi"
              style={{ color: "var(--earn-protocol-secondary-100)" }}
            >
              Stake {sumrSymbol}
            </Text>
            <Text
              as="p"
              variant="p3"
              style={{ color: "var(--earn-protocol-secondary-60)" }}
            >
              No lockup · Base
            </Text>
          </div>
        </div>
        <div className={classNames.totalAmount}>
          <Text
            as="p"
            variant="p1semi"
            style={{ color: "var(--earn-protocol-secondary-100)" }}
          >
            {format(walletBalance)} {sumrSymbol}
          </Text>
          <Text
            as="p"
            variant="p3"
            style={{ color: "var(--earn-protocol-secondary-60)" }}
          >
            in wallet
          </Text>
        </div>
      </div>

      <hr className={classNames.divider} />

      <div className={classNames.footer}>
        <div className={classNames.footerInfo}>
          <Text
            as="p"
            variant="p3"
            style={{ color: "var(--earn-protocol-secondary-60)" }}
          >
            Unstake any time, no penalty.
          </Text>
          <Text
            as="p"
            variant="p3"
            style={{
              color: atStakeLimit || remainingCapacity === 0n
                ? "var(--earn-protocol-warning-100)"
                : "var(--earn-protocol-secondary-60)",
            }}
          >
            {capacityMessage}
          </Text>
        </div>
        <Button
          variant="primarySmall"
          disabled={!onStake || atStakeLimit || maxStakeable === 0n}
          onClick={() => onStake?.()}
        >
          Stake
        </Button>
      </div>
    </Card>
  );
};
