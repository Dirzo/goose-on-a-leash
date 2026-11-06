# Cloudflare deploy

The pipeline is already in `.github/workflows/ci.yml` and `wrangler.jsonc`. It skips itself until the secrets exist.

1. In Cloudflare: **My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"** template. Scope it to your account.
2. Copy your **Account ID** (Workers & Pages overview, right column).
3. In GitHub, `Dirzo/goose-on-a-leash` → **Settings → Secrets and variables → Actions → New repository secret**:
   * `CLOUDFLARE_API_TOKEN`
   * `CLOUDFLARE_ACCOUNT_ID`
4. Push to `main`. The `deploy` job publishes `dist/` to `goose-on-a-leash.<your-subdomain>.workers.dev`.
   Pull requests from branches in this repo get a preview at `pr-<number>-goose-on-a-leash...`.
5. Optional: Workers → goose-on-a-leash → **Settings → Domains & Routes** → add `goose.noobscrub.com` (or similar).

The `check` job also runs the size budget (`scripts/budget.mjs`), so a build that would break the 16 MB single-file
limit fails before it deploys.
