"use client";

import { Suspense, useEffect, useState } from "react";
import {
  Button,
  Card,
  LoadingSpinner,
  SkeletonLine,
  Text,
} from "@/components/ui";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type Address, isAddress } from "viem";
import { useAccount } from "wagmi";

import { ClaimableRewardsCard } from "@/components/ClaimableRewardsCard";
import { ConnectButton } from "@/components/ConnectButton";
import { ExitModal } from "@/components/ExitModal";
import { FooterWrapper } from "@/components/FooterWrapper";
import { FractalGlassBackground } from "@/components/FractalGlassBackground/FractalGlassBackground";
import { PositionCard } from "@/components/PositionCard";
import { PositionCardSkeleton } from "@/components/PositionCardSkeleton";
import { StakedSumrCard } from "@/components/StakedSumrCard";
import { UnstakeModal } from "@/components/UnstakeModal";
import { CHAIN_LABELS } from "@/constants/chains";
import { useMerklRewards } from "@/hooks/useMerklRewards";
import { usePositions } from "@/hooks/usePositions";
import { useStakedSumr } from "@/hooks/useStakedSumr";
import { type UnstakeRequest } from "@/hooks/useUnstakeFlow";
import { formatFiatBalance } from "@/lib/format";
import { type FleetPosition } from "@/lib/positions";
import { estimateUsdValue } from "@/lib/prices";
import { type SumrStake } from "@/lib/staking";

import styles from "@/app/page.module.css";
import portfolioStyles from "./portfolio.module.css";

// Mirrors the loaded positions section 1:1 (same Card + row + stats shape) so the page doesn't
// shift layout once real data replaces it.
const PositionsListSkeleton = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: "var(--general-space-16)",
    }}
  >
    <Card variant="cardSecondary" className={portfolioStyles.positionsGrid}>
      <PositionCardSkeleton />
      <PositionCardSkeleton />
      <PositionCardSkeleton />
    </Card>
    <Card className={portfolioStyles.statsBlock}>
      <div className={portfolioStyles.statsRow}>
        <SkeletonLine width={110} height={16} />
        <SkeletonLine width={70} height={20} />
      </div>
      <div className={portfolioStyles.statsRow}>
        <SkeletonLine width={110} height={16} />
        <SkeletonLine width={70} height={20} />
      </div>
    </Card>
  </div>
);

const PortfolioContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const walletParam = searchParams.get("wallet");
  const { address, status: accountStatus } = useAccount();
  const [exitPosition, setExitPosition] = useState<FleetPosition | null>(null);
  const [unstakeRequest, setUnstakeRequest] = useState<UnstakeRequest | null>(
    null,
  );
  const [showPaused, setShowPaused] = useState(false);

  // Hydration guard: this is a static export, so the server prerenders with no wallet and no
  // `?wallet=` param (viewedAddress undefined). The client resolves both immediately, which would
  // produce a different tree. Gate all wallet/param-dependent content on `mounted` so the server
  // HTML and the first client render are identical.
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // ?wallet= wins so any address can be inspected (deliberately public); the connected
  // wallet is the fallback. Exits stay gated to the connected wallet's own positions.
  const paramAddress =
    walletParam && isAddress(walletParam)
      ? (walletParam as Address)
      : undefined;
  const viewedAddress = paramAddress ?? address;
  const isOwnWallet = Boolean(
    address &&
    viewedAddress &&
    address.toLowerCase() === viewedAddress.toLowerCase(),
  );

  // Keep the URL shareable: stamp the connected address into ?wallet= when it's missing.
  // status === 'connected' only - a stale 'reconnecting' address must not be stamped.
  useEffect(() => {
    if (accountStatus === "connected" && !walletParam) {
      router.replace(`/portfolio?wallet=${address}`);
    }
  }, [accountStatus, address, walletParam, router]);

  const {
    data,
    isLoading,
    error,
    refetch,
    isRefetching: positionsRefetching,
  } = usePositions(viewedAddress);
  const {
    data: staked,
    refetch: refetchStaked,
    isRefetching: stakedRefetching,
  } = useStakedSumr(viewedAddress);
  const {
    data: merklData,
    refetch: refetchMerkl,
    isRefetching: merklRefetching,
  } = useMerklRewards(viewedAddress);
  const stakedPosition = staked?.position ?? null;

  // Seamless refresh: dim the current list while a refetch is in flight (no skeleton, which is
  // reserved for the initial load). pointer-events off so stale action buttons can't be clicked.
  const fadeWhileRefetching = (fading: boolean) =>
    ({
      opacity: fading ? 0.45 : 1,
      transition: "opacity 0.2s ease-out",
      pointerEvents: fading ? "none" : undefined,
    }) as const;

  // Live vaults first (highest value first), paused ones tucked behind an expander below -
  // a paused vault can't be exited, so it shouldn't crowd out the positions that can.
  const positionsWithValue =
    data?.positions.map((position) => ({
      position,
      usdValue: estimateUsdValue(position, data.prices),
    })) ?? [];
  const activePositions = positionsWithValue
    .filter((entry) => !entry.position.paused)
    .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
  const pausedPositions = positionsWithValue.filter(
    (entry) => entry.position.paused,
  );
  const totalUsd = positionsWithValue.reduce(
    (sum, entry) => sum + (entry.usdValue ?? 0),
    0,
  );
  const pausedUsd = pausedPositions.reduce(
    (sum, entry) => sum + (entry.usdValue ?? 0),
    0,
  );

  return (
    <>
      <div className={styles.portfolioBackground}>
        <FractalGlassBackground skewed />
      </div>
      <div className={styles.portfolioVignette} />
      <div className={styles.portfolioContent}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            maxWidth: 1200,
            margin: "0 auto",
            padding: "24px 16px",
          }}
        >
          <Link
            href="/"
            prefetch={false}
            style={{ display: "flex", alignItems: "center" }}
          >
            <Image
              src="/img/branding/logo-dark.svg"
              alt="Summer.fi"
              width={130}
              height={28}
              style={{ width: "auto", height: "auto" }}
            />
          </Link>
          <ConnectButton />
        </header>
        <div
          style={{
            width: "100%",
            maxWidth: 900,
            margin: "0 auto",
            padding: "40px 16px 128px",
            display: "flex",
            flexDirection: "column",
            gap: "var(--general-space-24)",
            flex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--general-space-16)",
            }}
          >
            <Text as="h2" variant="h2">
              {mounted && viewedAddress && !isOwnWallet
                ? "Positions"
                : "Your positions"}
            </Text>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--general-space-16)",
              }}
            >
              {mounted && viewedAddress && pausedPositions.length > 0 ? (
                <div className={portfolioStyles.pausedToggleRow}>
                  <Text
                    as="p"
                    variant="p3"
                    style={{ color: "var(--earn-protocol-secondary-60)" }}
                  >
                    Include {pausedPositions.length} paused vault
                    {pausedPositions.length === 1 ? "" : "s"}
                  </Text>
                  <span
                    className={portfolioStyles.toggleSwitch}
                    data-checked={showPaused}
                    role="switch"
                    aria-checked={showPaused}
                  >
                    <input
                      type="checkbox"
                      checked={showPaused}
                      onChange={(event) => setShowPaused(event.target.checked)}
                    />
                    <span className={portfolioStyles.toggleThumb} />
                  </span>
                </div>
              ) : null}
              {mounted && viewedAddress ? (
                <Button
                  variant="secondarySmall"
                  disabled={
                    positionsRefetching || stakedRefetching || merklRefetching
                  }
                  onClick={() => {
                    void refetch();
                    void refetchStaked();
                    void refetchMerkl();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--general-space-8)",
                  }}
                >
                  {positionsRefetching ||
                  stakedRefetching ||
                  merklRefetching ? (
                    <LoadingSpinner size={16} strokeWidth={3} />
                  ) : null}
                  Refresh
                </Button>
              ) : null}
            </div>
          </div>

          {/* Until mounted, render a stable loading shell so SSG HTML matches the first client
              render (viewedAddress is only known on the client). */}
          {!mounted ? <PositionsListSkeleton /> : null}

          {mounted && !viewedAddress ? (
            <Card
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
              }}
            >
              <Text as="p" variant="p1semi">
                Connect the wallet you deposited with to see your positions.
              </Text>
              <ConnectButton />
            </Card>
          ) : null}

          {mounted && viewedAddress && !isOwnWallet ? (
            <Text
              as="p"
              variant="p3"
              style={{ color: "var(--earn-protocol-secondary-60)" }}
            >
              Viewing {viewedAddress} - connect that wallet to exit its
              positions.
            </Text>
          ) : null}

          {mounted && viewedAddress && isLoading ? <PositionsListSkeleton /> : null}

          {mounted && viewedAddress && error ? (
            <Card style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Text as="p" variant="p2">
                Could not read the blockchain. Check your connection (or the
                configured RPC endpoints) and try again.
              </Text>
              <Button variant="secondarySmall" onClick={() => refetch()}>
                Retry
              </Button>
            </Card>
          ) : null}

          {mounted && viewedAddress && data && data.positions.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--general-space-16)",
                ...fadeWhileRefetching(positionsRefetching),
              }}
            >
              <Card variant="cardSecondary" className={portfolioStyles.positionsGrid}>
                {(showPaused
                  ? [...activePositions, ...pausedPositions]
                  : activePositions
                ).map(({ position, usdValue }) => (
                  <PositionCard
                    key={`${position.chainId}-${position.fleetAddress}`}
                    position={position}
                    usdValue={usdValue}
                    onExit={isOwnWallet ? setExitPosition : undefined}
                  />
                ))}
              </Card>

              <Card className={portfolioStyles.statsBlock}>
                <div className={portfolioStyles.statsRow}>
                  <Text as="p" variant="p2">
                    USD in all vaults
                  </Text>
                  <Text as="p" variant="p1semi">
                    ${formatFiatBalance(totalUsd)}
                  </Text>
                </div>
                <div className={portfolioStyles.statsRow}>
                  <Text
                    as="p"
                    variant="p2"
                    style={{ color: "var(--earn-protocol-secondary-60)" }}
                  >
                    USD in paused vaults
                  </Text>
                  <Text
                    as="p"
                    variant="p1semi"
                    style={{ color: "var(--earn-protocol-secondary-60)" }}
                  >
                    ${formatFiatBalance(pausedUsd)}
                  </Text>
                </div>
              </Card>
            </div>
          ) : null}

          {mounted && viewedAddress && data && data.positions.length === 0 ? (
            <Card>
              <Text as="p" variant="p2">
                No active positions found for {viewedAddress}. If you expect
                one, the wallet may hold it on a chain whose RPC failed{" "}
                {data.failedChainIds.length > 0
                  ? `(failed: ${data.failedChainIds.map((id) => CHAIN_LABELS[id]).join(", ")})`
                  : ""}
                , or it was already withdrawn.
              </Text>
            </Card>
          ) : null}

          {mounted &&
          viewedAddress &&
          data &&
          data.failedChainIds.length > 0 &&
          data.positions.length > 0 ? (
            <Text
              as="p"
              variant="p3"
              style={{ color: "var(--earn-protocol-warning-100)" }}
            >
              Could not check:{" "}
              {data.failedChainIds.map((id) => CHAIN_LABELS[id]).join(", ")} -
              RPC unavailable. Positions there are not shown.
            </Text>
          ) : null}

          {mounted && viewedAddress && stakedPosition ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--general-space-24)",
                marginTop: "var(--general-space-16)",
                ...fadeWhileRefetching(stakedRefetching),
              }}
            >
              <Text as="h3" variant="h3">
                Staked SUMR
              </Text>
              <StakedSumrCard
                position={stakedPosition}
                onUnstake={
                  isOwnWallet
                    ? (stake: SumrStake) =>
                        setUnstakeRequest({
                          position: stakedPosition,
                          stake,
                          claimRewards: false,
                        })
                    : undefined
                }
                onClaim={
                  isOwnWallet
                    ? () =>
                        setUnstakeRequest({
                          position: stakedPosition,
                          stake: null,
                          claimRewards: true,
                        })
                    : undefined
                }
              />
            </div>
          ) : null}

          {mounted &&
          viewedAddress &&
          merklData &&
          merklData.rewards.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--general-space-24)",
                marginTop: "var(--general-space-16)",
                ...fadeWhileRefetching(merklRefetching),
              }}
            >
              <Text as="h3" variant="h3">
                Merkl Rewards
              </Text>
              <ClaimableRewardsCard
                rewards={merklData.rewards}
                user={viewedAddress}
                isOwnWallet={isOwnWallet}
              />
            </div>
          ) : null}
        </div>
        <FooterWrapper />
      </div>
      <ExitModal
        position={exitPosition}
        onClose={() => setExitPosition(null)}
        onRefresh={() => void refetch()}
      />
      <UnstakeModal
        request={unstakeRequest}
        onClose={() => setUnstakeRequest(null)}
        onRefresh={() => void refetchStaked()}
      />
    </>
  );
};

// useSearchParams requires a Suspense boundary under static export.
export default function PortfolioPage() {
  return (
    <Suspense fallback={null}>
      <PortfolioContent />
    </Suspense>
  );
}
