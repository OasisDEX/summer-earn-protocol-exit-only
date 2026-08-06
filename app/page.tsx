"use client";

import { useEffect, useState } from "react";
import { Text } from "@/components/ui";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";

import { ConnectButton } from "@/components/ConnectButton";
import { FractalGlassBackground } from "@/components/FractalGlassBackground/FractalGlassBackground";

import styles from "./page.module.css";

export default function LandingPage() {
  const router = useRouter();
  // status === 'connected' only - during wagmi's 'reconnecting' restore, isConnected is
  // already true from a stale stored address, which would bounce users with a locked wallet.
  const { address, status: accountStatus } = useAccount();

  // Hydration guard: the prerendered HTML never knows the wallet state.
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // A connected wallet has nothing to do here - send it straight to its portfolio.
  useEffect(() => {
    if (mounted && accountStatus === "connected") {
      router.replace(`/portfolio?wallet=${address}`);
    }
  }, [mounted, accountStatus, address, router]);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroBackground}>
          <FractalGlassBackground skewed />
        </div>
        <div className={styles.heroVignette} />
        <div className={styles.heroContent}>
          <div className={styles.heroLogo}>
            <Image
              src="/img/branding/dot-dark.svg"
              alt="Summer.fi"
              width={64}
              height={64}
              style={{ width: "auto", height: "auto" }}
            />
          </div>
          <Text as="h3" variant="h3">
            Summer.fi is winding down.
          </Text>
          <div className={styles.heroSubcopy}>
            <Text
              as="p"
              variant="p1"
              style={{
                textShadow: "1px 1px 0 rgba(0,0,0,0.2)",
              }}
            >
              The Summer.fi app has now been deactivated.
            </Text>
            <Text
              as="p"
              variant="p1"
              style={{
                textShadow: "1px 1px 0 rgba(0,0,0,0.2)",
              }}
            >
              While the Lazy Summer Protocol is currently in withdraw only mode,
              you can use this app to exit all your positions and claim any
              outstanding rewards. Read more on the{" "}
              <Link
                href="https://blog.summer.fi/sunsetting-summer-fi-and-the-labs-company/"
                className={styles.blogLink}
                target="_blank"
              >
                blog post
              </Link>
              .
            </Text>
          </div>
          <div className={styles.heroCta}>
            <ConnectButton />
            <Text as="p" variant="p4">
              to view and exit your positions
            </Text>
          </div>
        </div>
        <div className={styles.heroFooter}>
          <Text
            as="p"
            variant="p3"
            style={{ color: "var(--earn-protocol-secondary-60)" }}
          >
            Summer.fi 2026
          </Text>
          <Text
            as="span"
            variant="p3"
            style={{ color: "var(--earn-protocol-secondary-40)" }}
          >
            |
          </Text>
          <Link href="/privacy">
            <Text
              as="span"
              variant="p3"
              style={{ color: "var(--earn-protocol-secondary-60)" }}
            >
              Privacy Policy
            </Text>
          </Link>
          <Link href="/terms">
            <Text
              as="span"
              variant="p3"
              style={{ color: "var(--earn-protocol-secondary-60)" }}
            >
              Terms of Service
            </Text>
          </Link>
        </div>
      </section>
    </div>
  );
}
