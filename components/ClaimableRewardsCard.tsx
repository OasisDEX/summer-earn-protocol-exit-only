"use client";

import { type FC } from "react";
import {
  Button,
  Card,
  LoadingSpinner,
  Text,
  TokenWithNetworkIcon,
  type SupportedNetworkIds,
  type TokenSymbolsList,
} from "@/components/ui";
import { CHAIN_LABELS } from "@/constants/chains";
import { useMerklClaimFlow } from "@/hooks/useMerklClaimFlow";
import { formatCryptoBalance, formatFiatBalance } from "@/lib/format";
import { type MerklClaimableReward } from "@/lib/merkl-rewards";
import { type Address, formatUnits } from "viem";

import classNames from "./ClaimableRewardsCard.module.css";

interface ClaimableRewardsCardProps {
  rewards: MerklClaimableReward[];
  user?: Address;
  isOwnWallet?: boolean;
}

export const ClaimableRewardsCard: FC<ClaimableRewardsCardProps> = ({
  rewards,
  user,
  isOwnWallet = true,
}) => {
  const { status, errorMessage, executed, executeClaim } = useMerklClaimFlow(
    rewards,
    user,
  );

  if (rewards.length === 0) return null;

  const primaryChainId = rewards[0].chainId;
  // Rewards can span distribution chains — label every chain involved.
  const chainName = [...new Set(rewards.map((reward) => reward.chainId))]
    .map((chainId) => CHAIN_LABELS[chainId] ?? `Chain ${chainId}`)
    .join(", ");

  return (
    <Card variant="cardSecondary" className={classNames.card}>
      <div className={classNames.header}>
        <div className={classNames.titleBlock}>
          <TokenWithNetworkIcon
            tokenName={rewards[0].token.symbol.toUpperCase() as TokenSymbolsList}
            chainId={primaryChainId as SupportedNetworkIds}
            variant="medium"
          />
          <div>
            <Text
              as="p"
              variant="p1semi"
              style={{ color: "var(--earn-protocol-secondary-100)" }}
            >
              Merkl Claimable Rewards
            </Text>
            <Text
              as="p"
              variant="p3"
              style={{ color: "var(--earn-protocol-secondary-60)" }}
            >
              Merkl distributor · {chainName}
            </Text>
          </div>
        </div>
      </div>

      {rewards.map((reward, index) => {
        const claimableFormatted = formatCryptoBalance(
          formatUnits(reward.claimableNow, reward.token.decimals),
        );
        const pendingFormatted =
          reward.pending > 0n
            ? formatCryptoBalance(
                formatUnits(reward.pending, reward.token.decimals),
              )
            : null;

        const usdEstimate =
          reward.token.price !== null
            ? Number(formatUnits(reward.claimableNow, reward.token.decimals)) *
              reward.token.price
            : null;

        const includesExternal = reward.summerAmount < reward.cumulativeAmount;

        return (
          <div key={`${reward.chainId}-${reward.token.address}-${index}`}>
            <hr className={classNames.divider} />
            <div
              className={classNames.rewardRow}
              style={{ paddingTop: "var(--general-space-16)" }}
            >
              <div className={classNames.rewardInfo}>
                <Text
                  as="p"
                  variant="p2semi"
                  style={{ color: "var(--earn-protocol-secondary-100)" }}
                >
                  {claimableFormatted} {reward.token.symbol}
                  {usdEstimate !== null
                    ? ` (≈ $${formatFiatBalance(usdEstimate)})`
                    : ""}
                </Text>
                {includesExternal ? (
                  <Text
                    as="p"
                    variant="p3"
                    style={{ color: "var(--earn-protocol-secondary-60)" }}
                  >
                    Includes rewards from other Merkl campaigns
                  </Text>
                ) : null}
                {pendingFormatted ? (
                  <Text
                    as="p"
                    variant="p3"
                    style={{ color: "var(--earn-protocol-warning-100)" }}
                  >
                    +{pendingFormatted} {reward.token.symbol} pending (claimable
                    after the next Merkl root update)
                  </Text>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}

      <hr className={classNames.divider} />

      <div className={classNames.actionRow}>
        <div>
          {errorMessage ? (
            <Text
              as="p"
              variant="p3"
              style={{ color: "var(--earn-protocol-warning-100)" }}
            >
              {errorMessage}
            </Text>
          ) : executed ? (
            <Text
              as="p"
              variant="p3"
              style={{ color: "var(--earn-protocol-success-100)" }}
            >
              Claim transaction submitted! Balances update in a few minutes.
            </Text>
          ) : (
            <Text
              as="p"
              variant="p3"
              style={{ color: "var(--earn-protocol-secondary-60)" }}
            >
              Claims are processed on-chain on {chainName}
            </Text>
          )}
        </div>

        <Button
          variant="primarySmall"
          disabled={
            !isOwnWallet ||
            status === "in-progress" ||
            status === "done" ||
            rewards.every((r) => r.claimableNow === 0n)
          }
          onClick={() => void executeClaim()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--general-space-8)",
          }}
        >
          {status === "in-progress" ? (
            <LoadingSpinner size={16} strokeWidth={3} />
          ) : null}
          {status === "in-progress"
            ? "Claiming..."
            : status === "done"
              ? "Claimed"
              : "Claim rewards"}
        </Button>
      </div>
    </Card>
  );
};
