# Supabase Community Setup Guide for Moview

Follow these steps to turn on sign-in, viewer ratings, reviews, watchlists, and admin moderation on your Moview site. No coding experience is required.

---

## Step 1: Create a Free Supabase Project

1. Go to [supabase.com](https://supabase.com) and click **Start your project**.
2. Sign in (GitHub or email) and click **New project**.
3. Choose an Organization, enter a project name (for example `moview-community`), create a strong database password, pick the region closest to India (such as **Mumbai (ap-south-1)** or **Singapore (ap-southeast-1)**), and click **Create new project**.
4. Wait 1–2 minutes until the project dashboard finishes provisioning.

---

## Step 2: Create the Database Tables & Security Rules

1. In your Supabase project sidebar, click **SQL Editor**.
2. Click **New query**.
3. Open the file `supabase/schema.sql` from this project, copy the entire contents, and paste it into the SQL Editor.
4. Click **Run** (bottom-right). You should see a green **Success** message.

---

## Step 3: Turn On Email Magic Link & Google Sign-In

### Email Magic Link
1. In the left sidebar, go to **Authentication** → **Providers**.
2. **Email** is enabled by default. Click it to confirm **Enable Email provider** is turned on, then save.

### Google Sign-In
1. In **Authentication** → **Providers**, click **Google** and toggle **Enable Sign in with Google** on.
2. Open [Google Cloud Console](https://console.cloud.google.com/) in another tab:
   - Create or select a project.
   - Go to **APIs & Services** → **OAuth consent screen**, set it to **External**, and fill in your app name (`Moview`) and email.
   - Go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID** → **Web application**.
   - Under **Authorized redirect URIs**, paste the **Callback URL** shown inside Supabase's Google provider screen (it looks like `https://YOUR-PROJECT.supabase.co/auth/v1/callback`).
   - Copy the **Client ID** and **Client Secret** back into Supabase's Google provider settings and click **Save**.

### Redirect URLs (Important!)
1. Go to **Authentication** → **URL Configuration**.
2. Set **Site URL** to `https://moview.com`.
3. Under **Redirect URLs**, add:
   - `https://moview.com/**`
   - `http://localhost:3000/**` (if testing locally)

---

## Step 4: Copy Your Public Supabase Keys to Cloudflare Pages

1. In Supabase, go to **Project Settings** (gear icon) → **API** (or **Data API** / **API Keys**).
2. Copy:
   - **Project URL** (`SUPABASE_URL`)
   - **anon / public key** (`SUPABASE_ANON_KEY`) — *Note: Never copy the `service_role` secret key into your site!*
3. In **Cloudflare Pages** → your Moview project → **Settings** → **Environment variables**:
   - Add `SUPABASE_URL` = your Project URL
   - Add `SUPABASE_ANON_KEY` = your anon public key
4. Trigger a new deployment (or rebuild) so Eleventy injects those two public values into your site.

---

## Step 5: Make Yourself an Admin for Moderation

1. Sign in once on your live Moview website (`https://moview.com/sign-in/`) and choose your username.
2. Open Supabase → **Table Editor** → **profiles**.
3. Find your row, double-click the `is_admin` column, change `false` to `true`, and save.
4. Refresh Moview—you will now see **Admin Moderation** in your avatar menu, linking to `/admin-moderation/` where you can:
   - Review reported community comments and hide or delete policy violations.
   - See **Most Requested Titles** submitted by signed-in visitors via the **Request a review** button on `/title/` pages (stored in the `review_requests` table created by `supabase/schema.sql`).

