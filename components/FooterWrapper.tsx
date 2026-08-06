"use client";

import Link from "next/link";

import { Text } from "@/components/ui";

export const FooterWrapper = () => {
  return (
    <footer
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--general-space-8)",
        padding: "24px 16px",
      }}
    >
      <Text
        as="p"
        variant="p3"
        style={{ color: "var(--earn-protocol-secondary-60)" }}
      >
        Thanks for everything - Summer.fi
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
      <Text
        as="span"
        variant="p3"
        style={{ color: "var(--earn-protocol-secondary-40)" }}
      >
        |
      </Text>
      <Link href="/terms">
        <Text
          as="span"
          variant="p3"
          style={{ color: "var(--earn-protocol-secondary-60)" }}
        >
          Terms of Service
        </Text>
      </Link>
    </footer>
  );
};
