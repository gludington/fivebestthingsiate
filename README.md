# The Best Five Things I Ate 🍕

A beautiful food tracking app where you can document your favorite dining experiences with photos, dates, notes, and links. Built with Astro, Cloudflare D1, R2, and Google OAuth.

## Features

- ✅ **Google OAuth** - Secure authentication
- ✅ **Image uploads** - Store food photos in Cloudflare R2
- ✅ **Mobile camera support** - Use your phone camera directly
- ✅ **Responsive design** - Beautiful on desktop and mobile
- ✅ **Drag & drop sorting** - Reorder your top 5
- ✅ **Rich data** - Name, date, photo, link, and notes for each item
- ✅ **shadcn-inspired UI** - Modern, clean design with Tailwind CSS
- ✅ **100% free hosting** - Cloudflare's generous free tier

## Tech Stack

- **Framework:** Astro (SSR)
- **Auth:** Arctic (Google OAuth)
- **Database:** Cloudflare D1 (SQLite)
- **Storage:** Cloudflare R2 (Image uploads)
- **Styling:** Tailwind CSS (shadcn design system)
- **Hosting:** Cloudflare Pages
- **Runtime:** Node.js

## Setup Google OAuth

### 1. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Google+ API
4. Create OAuth credentials:
   - Application type: **Web application**
   - **Authorized redirect URIs:**
     - `http://localhost:4321/auth/callback/google` (local dev)
     - `https://your-app.pages.dev/auth/callback/google` (production)
5. Copy your **Client ID** and **Client Secret**

## Local Development

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars`:

```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=http://localhost:4321/auth/callback/google
SESSION_SECRET=a-long-random-string-at-least-32-chars
```

Generate SESSION_SECRET:
```bash
openssl rand -base64 32
```

### 3. Create Local D1 Database

```bash
npx wrangler d1 execute DB --local --file=./migrations/0001_init.sql
```

### 3a. Create D1 Database

```bash
npx wrangler d1 create best-five-db
```

Update `wrangler.toml` with the `database_id` you receive.

### 4. Create R2 Bucket (for images)

```bash
npx wrangler r2 bucket create best-five-images
```

### 5. Run Migration

```bash
npm run db:migrate:local
```

### 6. Run Dev Server

```bash
npm run dev
```

Visit `http://localhost:4321` 🎉

**Note:** Image uploads won't work locally without additional R2 configuration. They'll work automatically in production.

## Deploy to Cloudflare

### 1. Create Production Database

```bash
npx wrangler d1 create best-five-db
```

Update `wrangler.toml` with the production `database_id`.

### 2. Run Migration

```bash
npm run db:migrate
```

### 3. Create R2 Bucket

```bash
npx wrangler r2 bucket create best-five-images
```

### 4. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 5. Deploy to Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. **Pages** → **Create a project**
3. Connect your GitHub repository
4. Build settings:
   - **Framework:** Astro
   - **Build command:** `npm run build`
   - **Build output:** `dist`
5. Click **Save and Deploy**

### 6. Configure Environment Variables

In Cloudflare Pages → **Settings** → **Environment variables**:

Add for **Production**:
- `GOOGLE_CLIENT_ID`: Your Google client ID
- `GOOGLE_CLIENT_SECRET`: Your Google client secret
- `GOOGLE_REDIRECT_URI`: `https://your-app.pages.dev/auth/callback/google`
- `SESSION_SECRET`: Your random secret (32+ characters)

### 7. Bind D1 Database

**Settings** → **Functions** → **D1 database bindings**:
- Variable name: `DB`
- D1 database: `best-five-db`

### 8. Bind R2 Bucket

**Settings** → **Functions** → **R2 bucket bindings**:
- Variable name: `IMAGES`
- R2 bucket: `best-five-images`

### 9. Update Google OAuth

Go to Google Cloud Console and add your production URL to authorized redirect URIs:
- `https://your-app.pages.dev/auth/callback/google`

### 10. Redeploy

**Deployments** → Click **...** on latest deployment → **Retry deployment**

🚀 Your app is now live!

## Project Structure

```
best-five/
├── migrations/
│   └── 0001_init.sql              # Database schema
├── src/
│   ├── env.d.ts                   # TypeScript types
│   ├── middleware.ts              # Auth middleware
│   ├── lib/
│   │   └── auth.ts                # Auth utilities
│   └── pages/
│       ├── index.astro            # Main UI (table + modal)
│       ├── auth/
│       │   ├── login/
│       │   │   └── google.ts      # OAuth initiate
│       │   ├── callback/
│       │   │   └── google.ts      # OAuth callback
│       │   └── logout.ts          # Logout
│       └── api/
│           ├── upload.ts          # Image upload to R2
│           ├── images/
│           │   └── [...path].ts   # Serve images from R2
│           ├── items.ts           # GET all, POST new
│           └── items/
│               ├── [id].ts        # PATCH, DELETE
│               └── reorder.ts     # Reorder items
├── astro.config.mjs               # Astro config
├── wrangler.toml                  # Cloudflare config
├── tailwind.config.mjs            # Tailwind config
├── package.json
└── tsconfig.json
```

## Database Schema

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(name) <= 200),
  date TEXT NOT NULL,
  description TEXT CHECK(length(description) <= 1000),
  url TEXT CHECK(length(url) <= 500),
  image_url TEXT,
  order_index INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## Features in Detail

### Image Upload
- **Mobile:** Use `capture="environment"` to access camera directly
- **Desktop:** Standard file picker
- **Storage:** Cloudflare R2 (S3-compatible)
- **Max size:** 5MB per image
- **Auto-deletion:** Images deleted when item is deleted

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

- **Pages:** 500 builds/month, unlimited requests
- **D1:** 5GB storage, 5M reads/day, 100K writes/day
- **R2:** 10GB storage, 1M Class A operations/month
- **Bandwidth:** Unlimited

Perfect for personal use!

## Troubleshooting

### Images not uploading locally

R2 local development requires additional setup. Images will work automatically in production. For local testing, you can:
1. Deploy to Cloudflare
2. Or configure local R2 (see Wrangler docs)

### "Unauthorized" errors

- Check session cookie is set
- Verify SESSION_SECRET is configured
- Try logout and login again

### Table not responsive

- Clear browser cache
- Check Tailwind CSS is loaded
- Inspect responsive classes (hidden sm:table-cell, etc.)

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
