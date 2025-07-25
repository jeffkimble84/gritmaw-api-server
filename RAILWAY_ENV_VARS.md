# Railway Environment Variables Configuration

Copy and paste these into your Railway dashboard:

## Required Variables

```bash
# NextAuth Configuration
NEXTAUTH_URL=${{RAILWAY_PUBLIC_DOMAIN}}
NEXTAUTH_SECRET=generate_with_openssl_rand_-base64_32

# MongoDB - Use Railway's MongoDB service
MONGODB_URI=${{MongoDB.MONGO_URL}}

# Anthropic API
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Frontend URL - Update with your actual Vercel URL
FRONTEND_URL=https://gritmaw.vercel.app
```

## Optional OAuth Variables (if using social login)

```bash
# Google OAuth (from existing config)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# GitHub OAuth (add if needed)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

## Notes:

1. **NEXTAUTH_SECRET**: Generate a new one with:
   ```bash
   openssl rand -base64 32
   ```

2. **MONGODB_URI**: If using Railway's MongoDB addon, it will be auto-populated as `${{MongoDB.MONGO_URL}}`
   - Alternative: Use MongoDB Atlas connection string if you have one

3. **FRONTEND_URL**: Replace with your actual Vercel deployment URL

4. **Railway Public Domain**: Railway will auto-generate this as something like:
   - `https://gritmaw-api-server-production.up.railway.app`

5. **Google OAuth**: The credentials found are from the existing setup. Make sure the redirect URIs are updated in Google Console to include your Railway domain.