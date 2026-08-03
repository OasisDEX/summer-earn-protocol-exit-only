"use client";

import { type FC, useEffect, useState } from "react";
import {
  AmountInput,
  Button,
  Card,
  LoadingSpinner,
  Modal,
  Text,
} from "@/components/ui";
import { formatCryptoBalance } from "@/lib/format";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useSwitchChain } from "wagmi";

import { CHAIN_LABELS } from "@/constants/chains";
import { useAutoCloseCountdown } from "@/hooks/useAutoCloseCountdown";
import { type StepStatus } from "@/hooks/useUnstakeFlow";
import { type StakeRequest, useStakeFlow } from "@/hooks/useStakeFlow";
import { type StakeAvailability } from "@/lib/stake-availability";
import { type StakeStepType } from "@/lib/stake-plan";

const statusLabels: { [status in StepStatus]: string } = {
  pending: "",
  "in-progress": "Waiting for confirmation…",
  done: "Done",
  error: "Failed - you can retry",
};

const stepDescriptions: { [type in StakeStepType]: string } = {
  approve:
    "A one-time permission that lets the staking contract move the SUMR you are staking. No funds leave your wallet in this step.",
  stake:
    "Moves your SUMR into the no-lockup staking bucket. There is no lock-up period - you can unstake it again at any time with no penalty.",
};

interface StakeModalProps {
  availability: StakeAvailability | null;
  onClose: () => void;
  /** Seamlessly re-fetch the SUMR staking data (no full-page reload). */
  onRefresh?: () => void;
}

export const StakeModal: FC<StakeModalProps> = ({
  availability,
  onClose,
  onRefresh,
}) => {
  const { address, chainId: connectedChainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [amountText, setAmountText] = useState("");
  const [request, setRequest] = useState<StakeRequest | null>(null);
  const flow = useStakeFlow(request, address);

  const onWrongChain =
    availability !== null && connectedChainId !== availability.chainId;

  // Automatic seamless refresh: on success refetch immediately; on a failure after something
  // already executed, refetch too. No full-page reload.
  useEffect(() => {
    if (flow.allDone) onRefresh?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.allDone]);

  useEffect(() => {
    if (flow.errorMessage && flow.executedAny) onRefresh?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.errorMessage, flow.executedAny]);

  // On success, auto-close after a visible 5s countdown; closing manually earlier resets it.
  const secondsLeft = useAutoCloseCountdown(flow.allDone, 5, onClose);

  const format = (amount: bigint, decimals = availability?.sumrDecimals ?? 18) =>
    formatCryptoBalance(formatUnits(amount, decimals));

  const reset = () => {
    setAmountText("");
    setRequest(null);
  };

  const close = () => {
    // Any executed tx ⇒ seamlessly re-read (wallet balance/capacity change on stake). No reload.
    if (flow.executedAny) onRefresh?.();
    reset();
    onClose();
  };

  // Parse the amount text; malformed input is treated as invalid, never throws during render.
  let amount = 0n;
  let parseError = false;

  if (amountText.trim() !== "" && availability) {
    try {
      amount = parseUnits(amountText, availability.sumrDecimals);
    } catch {
      parseError = true;
    }
  }

  let continueDisabled = true;
  let continueMessage: string | null = null;

  if (availability && !parseError && amount > 0n) {
    if (amount > availability.walletBalance) {
      continueMessage = `Not enough SUMR - you have ${format(availability.walletBalance)} SUMR`;
    } else if (amount > availability.remainingCapacity) {
      continueMessage = `Only ${format(availability.remainingCapacity)} SUMR of no-lockup capacity is left`;
    } else if (availability.atStakeLimit) {
      continueMessage = "You've reached the maximum number of stakes";
    } else {
      continueDisabled = false;
    }
  }

  const handleContinue = () => {
    if (!availability || continueDisabled) return;

    setRequest({ availability, amount });
  };

  return (
    <Modal openModal={availability !== null} closeModal={close} withCloseButton>
      <Card
        variant="cardSecondary"
        style={{
          flexDirection: "column",
          gap: "var(--general-space-16)",
          width: "min(440px, 92vw)",
        }}
      >
        <Text as="h5" variant="h5">
          Stake SUMR
        </Text>

        {request === null && availability ? (
          <>
            <AmountInput
              value={amountText}
              onChange={setAmountText}
              onMax={() =>
                setAmountText(
                  formatUnits(availability.maxStakeable, availability.sumrDecimals),
                )
              }
              symbol={availability.sumrSymbol}
            />

            <Text
              as="p"
              variant="p3"
              style={{ color: "var(--earn-protocol-secondary-60)" }}
            >
              {format(availability.walletBalance)} {availability.sumrSymbol} in
              wallet · {format(availability.remainingCapacity)}{" "}
              {availability.sumrSymbol} no-lockup capacity left
            </Text>

            {continueMessage ? (
              <Text
                as="p"
                variant="p3"
                style={{ color: "var(--earn-protocol-warning-100)" }}
              >
                {continueMessage}
              </Text>
            ) : null}

            <Button
              variant="primarySmall"
              disabled={continueDisabled}
              onClick={handleContinue}
            >
              Continue
            </Button>
          </>
        ) : null}

        {request !== null ? (
          <>
            {flow.loading ? <LoadingSpinner /> : null}

            {!flow.loading
              ? flow.steps.map((step, index) => {
                  const status = flow.statuses[index];
                  const isCurrent = index === flow.currentIndex;
                  const locked = index > flow.currentIndex;

                  return (
                    <Card
                      key={`${step.type}-${index}`}
                      variant="cardPrimary"
                      style={{
                        opacity: locked ? 0.5 : 1,
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <Text as="p" variant="p2semi">
                          {index + 1}. {step.label}
                        </Text>
                        <Text
                          as="p"
                          variant="p3"
                          style={{
                            color:
                              status === "done"
                                ? "var(--earn-protocol-success-100)"
                                : status === "error"
                                  ? "var(--earn-protocol-critical-100)"
                                  : "var(--earn-protocol-secondary-60)",
                          }}
                        >
                          {statusLabels[status]}
                        </Text>
                      </div>

                      <Text
                        as="p"
                        variant="p3"
                        style={{ color: "var(--earn-protocol-secondary-60)" }}
                      >
                        {stepDescriptions[step.type]}
                      </Text>

                      {isCurrent && !flow.allDone ? (
                        onWrongChain ? (
                          <Button
                            variant="secondarySmall"
                            disabled={isSwitching}
                            onClick={() =>
                              availability &&
                              switchChain({ chainId: availability.chainId })
                            }
                          >
                            {isSwitching
                              ? "Switching…"
                              : `Switch to ${availability ? CHAIN_LABELS[availability.chainId] : ""}`}
                          </Button>
                        ) : (
                          <Button
                            variant="primarySmall"
                            disabled={status === "in-progress"}
                            onClick={() => void flow.executeCurrent()}
                          >
                            {status === "in-progress"
                              ? "Confirm in wallet…"
                              : status === "error"
                                ? "Retry"
                                : "Sign transaction"}
                          </Button>
                        )
                      ) : null}
                    </Card>
                  );
                })
              : null}

            {flow.errorMessage ? (
              <Text
                as="p"
                variant="p3"
                style={{
                  color: "var(--earn-protocol-critical-100)",
                  overflowWrap: "anywhere",
                  maxHeight: 120,
                  overflowY: "auto",
                }}
              >
                {flow.errorMessage}
              </Text>
            ) : null}

            {flow.allDone ? (
              <>
                <Text
                  as="p"
                  variant="p2"
                  style={{ color: "var(--earn-protocol-success-100)" }}
                >
                  Done - your SUMR is staked with no lock-up. You can unstake
                  it at any time.
                </Text>
                <Text
                  as="p"
                  variant="p3"
                  style={{
                    color: "var(--earn-protocol-secondary-60)",
                    textAlign: "center",
                  }}
                >
                  This window will close after {secondsLeft} second
                  {secondsLeft === 1 ? "" : "s"}
                </Text>
              </>
            ) : null}

            {/* Only while nothing is in flight: rebuilding the plan under a pending signature
                would leave a signed-but-unaccounted-for tx behind. */}
            {!flow.executedAny && !flow.statuses.includes("in-progress") ? (
              <Button variant="secondarySmall" onClick={() => setRequest(null)}>
                Change amount
              </Button>
            ) : null}
          </>
        ) : null}
      </Card>
    </Modal>
  );
};
