# GritMaw API Server

Railway backend for the GritMaw trading intelligence platform.

## Architecture

This is the **backend API server** for the hybrid deployment:
- **Frontend**: Deployed on Vercel (CDN optimized)
- **Backend**: Deployed on Railway (persistent connections)

## Features

- ✅ Persistent MongoDB connections (20 pool vs 5 serverless)
- ✅ Next.js API routes with Railway optimization
- ✅ CORS configured for Vercel frontend
- ✅ Health monitoring endpoints
- ✅ Environment-based configuration

## Deployment

Deploy to Railway:

1. Create Railway project
2. Connect to GitHub repo
3. Set root directory to `api-server/`
4. Add MongoDB service
5. Configure environment variables

See `../HYBRID-DEPLOYMENT.md` for complete guide.

## Environment Variables

Required environment variables in Railway:

```
MONGODB_URL=${{MongoDB.MONGO_URL}}
FRONTEND_URL=https://your-vercel-app.vercel.app
NEXTAUTH_URL=${{RAILWAY_PUBLIC_DOMAIN}}
NEXTAUTH_SECRET=your-secret
GOOGLE_CLIENT_ID=your-google-id
GOOGLE_CLIENT_SECRET=your-google-secret
```

## Health Check

Monitor backend health at: `/api/health`

## Development

```bash
npm install
npm run dev
```

Backend runs on port 3000 by default (Railway will set PORT automatically).