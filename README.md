# The Five Best Things I Ate 🍕

A beautiful food tracking app where you can document your favorite dining experiences with photos, dates, notes, and links. Built with Astro, Cloudflare D1, R2, and Google OAuth.

## Features

- ✅ **Loodingdongs sign-in** - Google, GitHub or Discord via loodingdongs-auth
- ✅ **Image uploads** - Store food photos in Cloudflare R2
- ✅ **Mobile camera support** - Use your phone camera directly
- ✅ **Responsive design** - Beautiful on desktop and mobile
- ✅ **Drag & drop sorting** - Reorder your top 5
- ✅ **Rich data** - Name, date, photo, link, and notes for each item
- ✅ **shadcn-inspired UI** - Modern, clean design with Tailwind CSS
- ✅ **100% free hosting** - Cloudflare's generous free tier

## Tech Stack

- **Framework:** Astro 7 (SSR) on a Cloudflare Worker
- **Auth:** [loodingdongs-auth](../loodingdongs-auth) over OpenID Connect (`openid-client`)
- **Database:** Cloudflare D1 (SQLite)
- **Storage:** Cloudflare R2 (image uploads)
- **Styling:** Tailwind CSS 4
- **Hosting:** Cloudflare Workers at https://fivebestthingsiate.loodingdongs.com

## How sign-in works

The app never talks to Google, GitHub or Discord. `/auth/login` sends the user to
`auth.loodingdongs.com` (authorization code + PKCE), `/auth/callback` exchanges the code, reads the
profile from UserInfo, and keys the user on the issuer's `sub`. The app then keeps its own session
in D1 (`sessions` table, 30 days). `POST /auth/logout` deletes that session and also ends the
loodingdongs-auth session (RP-initiated logout).

**Access requires the `fivebest-user` role** on this app, granted at loodingdongs-auth's `/admin`.
Anyone can sign in, but without the role they get `/no-access` (text in
`src/content/no-access.md`) and the API answers 403. Roles are stored in the session and re-read
hourly with a refresh token, so a revocation takes effect within an hour; after a grant, the
"I've been given access" button signs in again (silently, via SSO) to pick it up immediately.

## Account deletion

When an admin deletes someone at loodingdongs-auth's `/admin`, the auth server `POST`s a signed
account-purged Security Event Token to `/api/account-deletion`. `src/lib/account.ts` verifies it
against the auth server's JWKS (issuer, audience = our client ID, `typ: secevent+jwt`, 15-minute
age) and deletes the user's photos in R2, the groups they own, and their user row, which cascades to
items, sessions and memberships. The app's account deletion URL on the auth admin page must be
`https://fivebestthingsiate.loodingdongs.com/api/account-deletion`.

## Groups

People can form groups whose members see each other's lists, read-only.

- Anyone with the role can create a group at `/groups` and becomes its **owner**.
- Members invite others with a **link** (`/join/<token>`, valid 7 days). Any member can create
  a link when there's no live one; only the owner can revoke it. Joining takes a button press, so
  chat-app link previews can't join anyone.
- The owner can rename the group, remove members and delete the group. Members can leave.
- The role is still required to see anything, but people can accept an invite before they have
  it; `/no-access` tells them which groups are waiting.
- Member lists are at `/groups/<group>/<user>`; both people must be in that group.

## Local Development

1. Run loodingdongs-auth locally (`npm run dev` in `../loodingdongs-auth`, http://localhost:8787).
2. On http://localhost:8787/admin, register a **confidential** app with redirect URI
   `http://localhost:4321/auth/callback` and post-logout redirect URI `http://localhost:4321/`.
3. Grant yourself the `fivebest-user` role on that app (same admin page; sign in to the app once
   first so your account exists).
4. Configure and run this app:

```bash
pnpm install
cp .dev.vars.example .dev.vars   # paste OIDC_CLIENT_ID / OIDC_CLIENT_SECRET
pnpm db:migrate:local
pnpm dev                         # http://localhost:4321
```

D1 and R2 are simulated locally, so image uploads work in dev too.

After changing `wrangler.jsonc` or `.dev.vars.example`, regenerate `worker-configuration.d.ts`
with `pnpm cf-typegen`.

## Deploy

See [DEPLOYMENT.md](DEPLOYMENT.md).

## Project Structure

```
fivebestthingsiate/
├── migrations/                    # D1 migrations (wrangler d1 migrations apply)
├── src/
│   ├── env.d.ts                   # Locals types
│   ├── middleware.ts              # Loads the session from D1
│   ├── styles/global.css          # Tailwind entry
│   ├── lib/
│   │   ├── auth.ts                # OIDC config, user upsert, D1 sessions, roles
│   │   ├── groups.ts              # Groups, members, invite links
│   │   └── photos.ts              # Photo ownership, resizing, orphan sweep
│   ├── layouts/AppLayout.astro    # Signed-in page shell (header + nav)
│   ├── components/                # AppHeader, Logo, Avatar, Flash
│   └── pages/
│       ├── index.astro            # My list (table + modal)
│       ├── no-access.astro        # Signed in without the role
│       ├── groups/
│       │   ├── index.astro        # My groups, create a group
│       │   └── [id]/
│       │       ├── index.astro    # Members, invite link, owner actions
│       │       └── [userId].astro # A member's list, read-only
│       ├── join/[token].astro     # Accept an invite
│       ├── auth/
│       │   ├── login.ts           # Redirect to loodingdongs-auth
│       │   ├── callback.ts        # Code exchange, create session
│       │   └── logout.ts          # POST: end app + auth sessions
│       └── api/
│           ├── upload.ts          # Image upload to R2
│           ├── images/
│           │   └── [...path].ts   # Serve images from R2
│           ├── items.ts           # GET all, POST new
│           └── items/
│               ├── [id].ts        # PATCH, DELETE
│               └── reorder.ts     # Reorder items
├── astro.config.mjs
├── wrangler.jsonc                 # Worker config: route, D1, R2, vars
├── worker-configuration.d.ts      # Generated by `pnpm cf-typegen`
├── package.json
└── tsconfig.json
```

## Database Schema

See `migrations/0001_init.sql`. Users are keyed on the OIDC `sub`; sessions hold the ID token (for
logout), the refresh token and the app's roles.

## Features in Detail

### Image Upload
- **Mobile:** Use `capture="environment"` to access camera directly
- **Desktop:** Standard file picker
- **Storage:** Cloudflare R2 (S3-compatible)
- **Resizing:** Downscaled in the browser to 1600px WebP/JPEG before upload
- **Server fallback:** Uploads still over 1MB, or HEIC, are resized by the Cloudflare Images binding
- **Max size:** 20MB per upload; JPEG, PNG, WebP, GIF, AVIF or HEIC
- **Caching:** Served with `Cache-Control: immutable` (keys are unique per upload)
- **Cleanup:** Images are deleted with their item or when replaced; unsaved uploads are swept after 24 hours

### Responsive Table
- **Desktop:** Full table with all columns
- **Tablet:** Hides link column
- **Mobile:** Hides date column, shows date under name

### Drag & Drop Sorting
- Click and hold the drag handle (6 dots icon)
- Drag row up or down
- Drop to reorder
- Changes saved automatically

### Modal Form
- Opens for create or edit
- Image preview before upload
- Validation on all fields
- Date picker defaults to today
- ESC key to close

## API Endpoints

```
GET  /api/items              - Get all items for user
POST /api/items              - Create new item
PATCH /api/items/:id         - Update item
DELETE /api/items/:id        - Delete item (+ image)
POST /api/items/reorder      - Reorder items
POST /api/upload             - Upload image to R2
GET  /api/images/:path       - Serve image from R2
```

## Costs

**100% FREE** on Cloudflare's free tier:

- **Workers:** 100K requests/day
- **D1:** 5GB storage, 5M reads/day, 100K writes/day
- **R2:** 10GB storage, 1M Class A operations/month
- **Bandwidth:** Unlimited

Perfect for personal use!

## Troubleshooting

### "Authentication failed" after signing in

Check the Worker logs (`pnpm exec wrangler tail`). Usually the redirect URI registered at
loodingdongs-auth doesn't exactly match `APP_URL/auth/callback`, or the client ID/secret is wrong.

### "Unauthorized" errors

- Check the `session` cookie is set
- Log out and sign in again

## Customization Ideas

- Add categories (breakfast, lunch, dinner, dessert)
- Add ratings (1-5 stars)
- Add tags (vegetarian, spicy, etc.)
- Add location/restaurant search
- Export to PDF
- Share lists with friends
- Add a map view

## License

MIT - do whatever you want with it!

## Credits

Built with ❤️ using:
- [Astro](https://astro.build)
- [Cloudflare](https://cloudflare.com)
- [Tailwind CSS](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com) (design inspiration)
