# ScaleOrCut - Meta Ads Dashboard

Know what to **scale**, **watch**, and **cut** in 30 seconds.

A clean, hierarchical Meta Ads dashboard that gives you instant verdicts on every campaign, ad set, and ad.

## Features

- 📊 **Nested Hierarchy** - Campaign → Ad Set → Ad with collapsible rows
- 🚦 **Instant Verdicts** - SCALE / WATCH / CUT / LEARN for every level
- 📈 **Auto Rollups** - Metrics aggregate up the hierarchy
- ⚙️ **Custom Rules** - Set your own ROAS thresholds
- 📤 **CSV Upload** - Paste your Meta export, see results instantly
- 🔌 **API Ready** - Placeholder for Meta Marketing API integration

## Tech Stack

- **Next.js 14** - React framework with App Router
- **Supabase** - Database, Auth, Row Level Security
- **Tailwind CSS** - Styling
- **TypeScript** - Type safety

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo>
cd scaleorcut
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the contents of `supabase/schema.sql`
3. Go to Settings → API and copy your keys

### 3. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
scaleorcut/
├── app/
│   ├── dashboard/
│   │   ├── page.tsx        # Main dashboard
│   │   ├── settings/       # Rules configuration
│   │   ├── trends/         # Performance trends
│   │   ├── alerts/         # Alert settings
│   │   └── connect/        # Account management
│   ├── globals.css         # Global styles
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Redirects to /dashboard
├── components/
│   ├── csv-upload.tsx      # CSV file upload
│   ├── performance-table.tsx # Hierarchical data table
│   ├── sidebar.tsx         # Navigation sidebar
│   ├── stat-card.tsx       # Metric cards
│   └── verdict-badge.tsx   # SCALE/WATCH/CUT badges
├── lib/
│   ├── csv-parser.ts       # CSV parsing logic
│   ├── supabase.ts         # Supabase client & types
│   └── utils.ts            # Utility functions
├── supabase/
│   └── schema.sql          # Database schema
└── package.json
```

## CSV Format

Export from Meta Ads Manager with these columns:

| Column | Required | Description |
|--------|----------|-------------|
| Start Date | Yes | Date range start (YYYY-MM-DD) |
| End Date | Yes | Date range end |
| Ad Name | Yes | Name of the ad |
| Campaign Name | Yes | Campaign the ad belongs to |
| Ad Set Name | Yes | Ad set the ad belongs to |
| Impressions | No | Number of impressions |
| Link Clicks | No | Number of clicks |
| Amount Spent | Yes | Spend in dollars |
| Purchases | No | Number of conversions |
| Purchase Value | No | Revenue in dollars |

## Verdict Logic

| Verdict | Condition | Action |
|---------|-----------|--------|
| **SCALE** | ROAS ≥ 3.0x | Increase budget |
| **WATCH** | 1.5x ≤ ROAS < 3.0x | Monitor closely |
| **CUT** | ROAS < 1.5x (after learning) | Pause or kill |
| **LEARN** | Spend < $100 | Let it run |

All thresholds are customizable in Settings.

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import to Vercel
3. Add environment variables
4. Deploy

### Other Platforms

Works on any platform that supports Next.js:
- Railway
- Render
- AWS Amplify
- Self-hosted

## Future: Meta API Integration

The app is structured to support direct Meta API integration:

1. **OAuth Flow** - User connects their Meta account
2. **Data Sync** - Automatically pull ad data via API
3. **Scheduled Refresh** - Keep data up to date

For now, CSV upload provides the same data with manual export.

## License

MIT

---

Built for advertisers who value their time.

**scaleorcut.com**
