# 🚀 Deployment Guide: GitHub & Vercel

This repository has been configured and tested to be completely **workable locally**, **ready to push to GitHub**, and **deployable on Vercel** with full support for all 27+ live real-time geospatial providers.

---

## 🛠️ 1. Local Development

### Requirements
- **Node.js**: `v20.14.0+`, `v22.x`, `v24.x`, or `v26.x`
- **npm**: `v10+`

### Quick Start
```bash
# 1. Install dependencies
npm ci

# 2. Run system checks
npm run doctor

# 3. Start local development server
npm run dev
```
Open **`http://localhost:4173`** in your browser. The app runs keyless out of the box using public Esri satellite imagery, keyless terrain, OpenSky flights, FIRMS fire status, and weather layers.

---

## 🐙 2. Push to Your GitHub Repository

The cloned project is a clean Git workspace. Follow these steps to push it to your own GitHub account:

### Step 1: Create a new repository on GitHub
1. Go to [github.com/new](https://github.com/new).
2. Name your repository (e.g. `gods-eye-view` or `my-earth-viewer`).
3. Set visibility to **Public** or **Private**.
4. Do **not** initialize with README or license (the repo already has them).
5. Click **Create repository**.

### Step 2: Set your remote and push
Run the following commands in the project root:

```bash
# Point origin to your new repository
git remote set-url origin https://github.com/<YOUR-GITHUB-USERNAME>/<YOUR-REPO-NAME>.git

# Or if you prefer SSH:
# git remote set-url origin git@github.com:<YOUR-GITHUB-USERNAME>/<YOUR-REPO-NAME>.git

# Stage newly added deployment files
git add .

# Commit changes
git commit -m "feat: configure Vercel serverless deployment and broaden Node engine compatibility"

# Push to main branch
git push -u origin main
```

---

## ▲ 3. Deploy to Vercel

This project includes:
- `vercel.json` with framework detection, caching headers for Cesium 3D assets, and rewrites.
- `api/index.js` and `api/[...path].js` serverless function handlers routing all live `/api/*` proxies.

### Option A: 1-Click Import via Vercel Web Dashboard (Recommended)

1. Go to [vercel.com/new](https://vercel.com/new).
2. Select your GitHub account and import your repository.
3. Vercel automatically detects the configuration:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. *(Optional)* Add Environment Variables under **Environment Variables** (see below).
5. Click **Deploy**.

### Option B: Deploy via Vercel CLI

```bash
# Install Vercel CLI if not installed
npm install -g vercel

# Log in
vercel login

# Deploy preview
vercel

# Deploy to production
vercel --prod
```

---

## 🔑 4. Environment Variables (Optional Upgrades)

God's Eye View runs completely keyless by default! When you want enhanced capabilities, configure any of these environment variables in your Vercel Project Settings (**Settings → Environment Variables**):

| Variable | Provider | What It Unlocks |
| :--- | :--- | :--- |
| `CESIUM_ION_TOKEN` | [Cesium ion](https://cesium.com/ion/) | Photorealistic 3D Google tiles & world terrain (free personal tier) |
| `GOOGLE_MAPS_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/) | Google photorealistic 3D tiles & places |
| `GOOGLE_MAPS_SERVER_API_KEY`| Google Maps Platform | Google server-side Places search |
| `OPENAI_API_KEY` | [OpenAI](https://platform.openai.com/) | Realtime voice agent & HUD summary |
| `AISSTREAM_API_KEY` | [AISStream](https://aisstream.io/) | Global live vessel positions |
| `FIRMS_MAP_KEY` | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | Real-time global wildfire detections |
| `TOMTOM_API_KEY` | [TomTom](https://developer.tomtom.com/) | Live traffic density layers |
| `OPENSKY_CLIENT_ID` | [OpenSky Network](https://opensky-network.org/) | Higher flight polling credit rate limits |
| `OPENSKY_CLIENT_SECRET` | OpenSky Network | OpenSky OAuth2 secret |

---

## 🏗️ 5. What Was Configured for Deployment

1. **Node Engine Flexibility (`package.json`)**:
   Expanded from strictly `>=24.14.0` to `">=20.14.0 || >=22.0.0 || >=24.0.0"` so Vercel's standard Node 20 and 22 runtimes build without engine mismatch errors.
2. **Serverless API Bridge (`api/index.js` & `api/[...path].js`)**:
   Connects Vercel Serverless Functions to all 27+ backend provider plugins (`/api/opensky`, `/api/cctv/*`, `/api/weather`, `/api/firms/*`, etc.).
3. **Vercel Settings (`vercel.json`)**:
   Sets build options, function timeouts, route rewrites, and asset caching headers for Cesium workers and textures.
4. **Git Housekeeping (`.gitignore`)**:
   Ensures `.vercel` cache artifacts and local credentials are protected from being committed.
