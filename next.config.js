/** @type {import('next').NextConfig} */
const nextConfig = {
  // API-only Next.js configuration for Railway
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.FRONTEND_URL || 'https://*.vercel.app'
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS'
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, X-Requested-With'
          },
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true'
          }
        ]
      }
    ]
  },
  
  // Optimize for API-only deployment
  experimental: {
    outputFileTracingRoot: process.cwd(),
    outputFileTracingIgnores: ['**/node_modules/**']
  },
  
  // Disable image optimization since this is API-only
  images: {
    unoptimized: true
  }
}

module.exports = nextConfig