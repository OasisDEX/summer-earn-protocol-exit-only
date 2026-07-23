import { type Address } from "viem";

// Merkl's API sends Access-Control-Allow-Origin for any https:// origin but omits it for
// plain-http localhost, so `next dev` (http://localhost) gets CORS-blocked. In development
// the dev server proxies /merkl-api -> api.merkl.xyz (see next.config.ts rewrites); the
// static production build runs on an https origin and calls the API directly.
export const MERKL_API_BASE =
  process.env.NODE_ENV === "development"
    ? "/merkl-api/v4"
    : "https://api.merkl.xyz/v4";
export const MERKL_DISTRIBUTOR: Address =
  "0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae";

/** Both Merkl protocol IDs for Summer — union + deduplicate. */
export const MERKL_PROTOCOL_IDS = ["summerfinance", "SummerFinance"] as const;

/** Trusted campaign creators for Summer campaigns. */
export const MERKL_TRUSTED_CREATORS: Address[] = [
  "0x447BF9d1485ABDc4C1778025DfdfbE8b894C3796",
];

export const merklDistributorAbi = [
  {
    inputs: [
      { internalType: "address[]", name: "users", type: "address[]" },
      { internalType: "address[]", name: "tokens", type: "address[]" },
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" },
      { internalType: "bytes32[][]", name: "proofs", type: "bytes32[][]" },
    ],
    name: "claim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
