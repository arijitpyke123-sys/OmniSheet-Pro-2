# 🚀 Deploying OmniSheet Pro on Render

OmniSheet Pro is fully configured and ready for **1-click or manual deployment on Render** ([render.com](https://render.com)).

---

## ⚡ Option 1: 100% Free Static Site (Recommended)

Render offers **free static site hosting** with an ultra-fast global CDN, automated SSL/TLS certificates, continuous Git deployment, and **zero cold starts / sleep mode**.

### Steps:
1. **Push your code to GitHub / GitLab**.
2. Go to your [Render Dashboard](https://dashboard.render.com/) and click **New +** > **Static Site**.
3. Connect your GitHub/GitLab repository.
4. Fill in the settings:
   - **Name**: `omnisheet-pro` (or any name you prefer)
   - **Branch**: `main`
   - **Build Command**: `npm run build`
   - **Publish Directory**: `dist`
5. Click **Create Static Site**.
6. **Set up SPA Routing (Critical for Single-Page Apps)**:
   - In your Render static site dashboard, go to **Redirects/Rewrites**.
   - Click **Add Rule**:
     - **Type**: `Rewrite`
     - **Source**: `/*`
     - **Destination**: `/index.html`
   - Click **Save**.

Your app is now live at `https://omnisheet-pro.onrender.com`!

---

## ⚡ Option 2: 1-Click Render Blueprint (`render.yaml`)

This repository includes a pre-configured `render.yaml` Blueprint file.

1. Push your repository to GitHub.
2. In the Render Dashboard, click **New +** > **Blueprint**.
3. Select this repository.
4. Render will read `render.yaml` automatically and configure:
   - The Static Site with SPA rewrites and caching headers
   - Or the Node Web Service with `/api/health` check
5. Click **Apply**.

---

## ⚡ Option 3: Node.js Web Service (Full-Stack Express)

If you prefer running the app as a Node.js web service with the built-in Express server:

1. Click **New +** > **Web Service**.
2. Connect your repository.
3. Choose **Node** runtime.
4. Fill in the settings:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
5. Under **Environment Variables**:
   - `NODE_ENV` = `production`
   - `PORT` = `10000` (Render will set this automatically)
6. Click **Create Web Service**.

---

## ⚡ Option 4: Docker Container

This repository contains a production-ready, multi-stage `Dockerfile`.

1. Click **New +** > **Web Service**.
2. Select your repository.
3. Choose **Docker** as the Environment.
4. Click **Create Web Service**.

---

## 🔒 Firebase & Authentication Notes for Production

The Firebase configuration is bundled in the client code (`firebase-applet-config.json`).
If you want users to log in with Google Authentication on your Render domain:
1. Go to your [Google Cloud Console / Firebase Console](https://console.firebase.google.com/).
2. Navigate to **Authentication** > **Settings** > **Authorized Domains**.
3. Add your Render domain (e.g. `omnisheet-pro.onrender.com` or your custom domain).
4. Save changes. Users can now authenticate smoothly!

---

## 🛠️ Verification & Health Check

Once deployed, you can verify your service status:
- Frontend: `https://<your-app>.onrender.com/`
- Backend API Health: `https://<your-app>.onrender.com/api/health`
- Tenant Quota Config: `https://<your-app>.onrender.com/api/quota-plans`
