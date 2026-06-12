# Railway Deployment Guide

This guide provides instructions on how to deploy this application to [Railway](https://railway.app/), specifically emphasizing the configuration required to deploy to the custom domain `sizhu.c2.fufire.space`.

## Prerequisites

1. A Railway account.
2. Your project pushed to a GitHub repository.
3. Access to your DNS provider for the `fufire.space` domain.

## Setup Steps

1. Log in to your Railway dashboard and click **New Project**.
2. Select **Deploy from GitHub repo** and choose your repository.
3. Railway will automatically detect the Node.js environment.

## Environment Variables Structure

Once the service is created, go to the **Variables** tab and configure the following required environment variables to ensure the application starts and reaches a ready state.

- `GEMINI_API_KEY`: Your Google Gemini API Key.
- `APP_URL`: The public URL of your deployed application on Railway (should be `https://sizhu.c2.fufire.space`).
- *Optional/Contextual*: Include `SECRET_REF_FUFIRE_LIVE_KEY` or `FUFIRE_API_KEY` if communicating directly with other FuFire API nodes.

## Build and Start Command Requirements

Railway automatically detects `package.json` scripts. Our production flow bundles the Express server and Vite frontend:

- **Build Command**: `npm run build`
  - This inherently executes: `vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs`
- **Start Command**: `npm run start`
  - This executes: `node dist/server.cjs`

Railway will use these by default. You can manually verify or override them in the **Settings** -> **Deploy** options.

## Health and Readiness Check URLs

The application exposes standard endpoints to verify its health and initialization status. Configure Railway's instance Healthchecks in the **Settings** panel using these paths:

- **Health Endpoint**: `/api/health`
  - Returns `{"status": "ok"}`.
  - Purpose: Basic liveness ping to ensure the Express container is active and accepting connections.

- **Readiness Endpoint**: `/api/readiness`
  - Returns `{"status": "ready"}` if the server is both online and successfully configured with all required environment variables (`GEMINI_API_KEY`, `APP_URL`).
  - Returns `503 Service Unavailable` with a payload of missing variables if configuration is incomplete.
  - Purpose: Boot-time checks to prevent Railway from routing traffic to your instance before it is fully configured.

## DNS Configuration Steps (sizhu.c2.fufire.space)

To map the application to your specific custom domain:

1. In the Railway dashboard for your service, go to **Settings** -> **Networking** -> **Custom Domains**.
2. Click **Custom Domain** and enter `sizhu.c2.fufire.space`.
3. Railway will provide a CNAME record target (usually in the format of `<hash>.up.railway.app`).
4. Log into your DNS provider for `fufire.space`.
5. Create a new **CNAME** record:
   - **Name/Host**: `sizhu.c2`
   - **Target/Value**: Enter the Railway-provided CNAME string.
   - **TTL**: Auto or default (e.g., 3600).
6. Save the record. It may take a few minutes for propagation. Railway will automatically provision TLS/SSL certificates once propagation completes and the domain will be marked active.
