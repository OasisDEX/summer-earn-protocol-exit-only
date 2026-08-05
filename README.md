# Summer.fi Exit App

A simple, self-contained web app that lets Summer.fi depositors **withdraw their funds** from
both public and institutional vaults, **unstake their SUMR**, and **stake SUMR with no
lock-up** during the protocol wind-down. Connect a wallet, see your positions, exit.

It talks directly to the blockchain — there is no backend, no database, and no account to create.
The whole app builds into a folder of static files you can host anywhere.

- **Supported chains:** Ethereum, Base, Arbitrum, Sonic, Hyperliquid
- **Works out of the box** — no configuration or API keys required
- **Institutional vaults:** your positions in the per-institution deployments (Targen, Avantgarde,
  and the ExtDemoCorp demo clients) are listed alongside public ones, and you withdraw them in a
  single transaction.

## A note for institutional depositors

Institutional vaults exit by redeeming your vault shares directly from the vault contract —
one transaction, no token approval needed.

Some institutional vaults are wrapped in a **rounds** mechanism, where a withdrawal is a
request that a curator settles later and you claim afterwards. This app covers shares held
**in the vault itself**. If your funds are currently sitting in an unclaimed round receipt
rather than in vault shares, they will not show up here — contact your institution's
administrator to complete that redemption.

---

## Run it on your own computer

You only need [Node.js](https://nodejs.org) (version 20 or newer). Installing it also gives you
`npm`, used below.

1. **Download the code** — click the green *Code* button on GitHub → *Download ZIP*, then unzip it.
   (Or, if you use Git: `git clone <repo-url>`.)
2. **Open a terminal** in the project folder and run:

   ```bash
   npm install       # download the app's building blocks (one time)
   npm run dev       # start the app
   ```

3. **Open your browser** to **http://localhost:3817**.

To stop the app, press `Ctrl+C` in the terminal.

---

## Put it online (deploy)

The app is a set of plain static files, so it runs on almost any host. Pick whichever is easiest
for you — the first two are the most beginner-friendly and free.

### Vercel or Netlify (easiest — no terminal needed)

1. Push this code to your own GitHub account (or use *Download ZIP* → upload).
2. Sign in at [vercel.com](https://vercel.com) or [netlify.com](https://netlify.com) and choose
   **Import / Add new project**, then pick your repository.
3. Both auto-detect the settings below. Click **Deploy** — you get a live URL in about a minute.

### Cloudflare Pages / GitHub Pages / any other host

Use these settings (or build locally and upload the `out` folder):

| Setting          | Value          |
| ---------------- | -------------- |
| Build command    | `npm run build`|
| Output directory | `out`          |
| Node version     | `20`           |

To build the files yourself:

```bash
npm install
npm run build     # creates the ready-to-host "out" folder
```

Then upload everything inside `out/` to your host (S3 + CloudFront, nginx, GitHub Pages, etc.).

> **Tip:** If your host shows a "not found" error when visiting `/portfolio`, it isn't mapping
> clean URLs to their HTML files. Fix it by adding `trailingSlash: true` to
> [`next.config.ts`](next.config.ts) and rebuilding.

---

## Optional configuration

The app needs no setup, but you can add **WalletConnect** support (for mobile wallets and the
WalletConnect QR flow) by providing a free project ID from
[cloud.walletconnect.com](https://cloud.walletconnect.com):

- Create a file named `.env.local` in the project folder with:

  ```
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-id-here
  ```

- Or, on Vercel/Netlify/Cloudflare, add it as an **environment variable** in the project settings.

Without it, browser-extension wallets (MetaMask, Rabby, etc.) still work normally.

---

## Good to know

- **USD values are approximate** — token amounts are always exact. Stablecoins and ETH/EUR are
  priced from on-chain Chainlink feeds; staked SUMR shows an exact token amount with no USD estimate.
- **Paused vaults** are marked and grouped separately — they can't be exited until unpaused.
- If an exit fails because a vault can't serve the full amount right now, retrying later usually works.
- No-lockup stakes can be unstaked at any time with no penalty, and the no-lockup bucket has a fixed capacity cap — so how much you can stake may be limited by remaining bucket headroom rather than by your wallet balance.

---

## For maintainers

- **Commands:** `npm run dev` (local), `npm run build` (static build → `out/`),
  `npm run lint`, `npm run typecheck`, `npm test`.
- **Contract addresses** live in [`constants/addresses.ts`](constants/addresses.ts). If a fleet is
  decommissioned during the wind-down, add its address to `EXTRA_FLEETS` so remaining holders can
  still see and exit it.
- **`AdmiralsQuarters` addresses** are the current role-holding deployments (the ones in the SDK's
  `sumr.json` are stale and cause staked exits to revert). If the deployment moves again, rediscover
  the address that holds `ADMIRALS_QUARTERS_ROLE` on every fleet's rewards manager.
- **Sanity-check the read path** without a browser using
  [`scripts/check-positions.ts`](scripts/check-positions.ts):

  ```bash
  npx tsx scripts/check-positions.ts 0xYourAddress
  ```

---

## License

[MIT](LICENSE) — free to use, modify, host, and redistribute.
