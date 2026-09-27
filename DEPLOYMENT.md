# Deploying

The app is a Cloudflare Worker (Astro + `@astrojs/cloudflare`) served at
**https://fivebestthingsiate.loodingdongs.com**, signing in through
[loodingdongs-auth](../loodingdongs-auth). Everything is declared in `wrangler.jsonc`: the custom
domain, the D1 database, the R2 bucket and the non-secret vars.

## One-time setup

```bash
pnpm install
pnpm exec wrangler login

# 1. Storage (skip what already exists; put a new database_id in wrangler.jsonc)
pnpm exec wrangler d1 create fivebest-db
pnpm exec wrangler r2 bucket create fivebest-images
pnpm db:migrate:remote
```

2. **Register the app with loodingdongs-auth.** Sign in at https://auth.loodingdongs.com with an
   admin email, open **Manage apps and roles**, and register a **confidential** app:
   - redirect URI: `https://fivebestthingsiate.loodingdongs.com/auth/callback`
   - post-logout redirect URI: `https://fivebestthingsiate.loodingdongs.com/`

   Copy the client ID and secret (the secret is shown once).

   People need the **`fivebest-user`** role on this app to use it. Grant it on the same admin
   page (a person must have signed in once before they can be granted a role).

3. **First deploy with secrets.** `wrangler secret put` needs an existing Worker, so the first
   deploy carries them. Write them to a gitignored file and deploy:

```bash
printf 'OIDC_CLIENT_ID=...\nOIDC_CLIENT_SECRET=...\n' > .prod-secrets.env
pnpm build && pnpm exec wrangler deploy --secrets-file .prod-secrets.env
rm .prod-secrets.env
```

The `custom_domain` route attaches `fivebestthingsiate.loodingdongs.com` (DNS record and
certificate) on that deploy, since `loodingdongs.com` is already a zone on the account.

## Later deploys

```bash
pnpm deploy                  # astro build && wrangler deploy
pnpm db:migrate:remote       # when there's a new file in migrations/
pnpm exec wrangler secret put OIDC_CLIENT_SECRET   # to rotate the secret
```

`pnpm deploy` runs `astro build`, which writes `dist/server/wrangler.json`; `wrangler deploy` picks
that up automatically.

## Continuous deployment (optional)

Connect the GitHub repo under **Workers & Pages → fivebestthingsiate → Settings → Build** with
build command `pnpm build` and deploy command `pnpm exec wrangler deploy`. Secrets stay on the
Worker and don't need to be set in the build.

## Old resources

`best-five-db` and `best-five-images` are from before the rename to `fivebest-*`. They were
empty and nothing uses them.
