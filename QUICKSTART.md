# OpenHouse - Quick Start (5 Minutes)

Fastest path to running app.

## Step 1: Install (1 min)

```bash
npm install
```

## Step 2: Supabase (2 min)

1. Go to [supabase.com](https://supabase.com) → New Project
2. Name: `openhouse`, pick password, create
3. Settings → API → Copy URL + anon key
4. SQL Editor → New Query → Paste `supabase-schema.sql` → Run

## Step 3: Configure (30 sec)

```bash
cp .env.example .env
```

Edit `.env`:
```
EXPO_PUBLIC_SUPABASE_URL=your-url-here
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-key-here
```

## Step 4: Run (30 sec)

```bash
npm run ios
# or
npm run android
# or
npx expo start  # for physical device
```

## Step 5: Test (1 min)

1. Tap "Create Account"
2. Select "Agent"
3. Email: `test@test.com`, Password: `test123`
4. Tap "My Properties" → Add property
5. "Create Open House" → Show QR

Done! See SETUP_GUIDE.md for detailed testing.

## Troubleshooting

**"Supabase credentials not found"**
- Verify `.env` exists in project root
- Check no extra quotes in values
- Restart: `npx expo start -c`

**Camera not working**
- iOS: Settings → Privacy → Camera → OpenHouse
- Android: Settings → Apps → Permissions → Camera

**Build errors**
```bash
rm -rf node_modules
npm install
npx expo start -c
```

## Next Steps

- Read README.md for architecture
- See SETUP_GUIDE.md for full testing
- Check PROJECT_SUMMARY.md for implementation details
