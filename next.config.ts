import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: { position: "bottom-right" },
  // Fully static export - the deployed artifact is the out/ directory.
  output: "export",
  // S3 can't map /terms → terms.html. With trailingSlash, each route exports as
  // <route>/index.html, which S3 website hosting resolves natively.
  trailingSlash: true,
  reactStrictMode: false,
  images: { unoptimized: true },
  // Merkl's API rejects plain-http localhost origins (no Access-Control-Allow-Origin),
  // so in dev the Merkl calls go through this same-origin proxy. Defined for development
  // only — rewrites are unsupported (and unneeded) in the static `output: "export"` build,
  // which runs on an https origin and calls api.merkl.xyz directly.
  ...(process.env.NODE_ENV === "development"
    ? {
        rewrites: async () => [
          {
            source: "/merkl-api/:path*",
            destination: "https://api.merkl.xyz/:path*",
          },
        ],
      }
    : {}),
};

export default nextConfig;
