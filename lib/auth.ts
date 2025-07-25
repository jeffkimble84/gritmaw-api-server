/**
 * Simplified NextAuth Configuration
 * Eliminates build-time database connections
 */

import { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import GitHubProvider from "next-auth/providers/github"
import CredentialsProvider from "next-auth/providers/credentials"

// Test users for development (no database required)
const testUsers = [
  {
    id: 'test-admin',
    email: 'admin@gritmaw.com',
    name: 'Admin User',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE'
  },
  {
    id: 'test-institutional',
    email: 'trader@gritmaw.com',
    name: 'Institutional Trader',
    role: 'INSTITUTIONAL_TRADER',
    status: 'ACTIVE'
  },
  {
    id: 'test-retail',
    email: 'retail@gritmaw.com',
    name: 'Retail Trader',
    role: 'RETAIL_TRADER',
    status: 'ACTIVE'
  }
]

export const authOptions: NextAuthOptions = {
  // Use JWT strategy to avoid database dependency
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  
  providers: [
    // Credentials provider for test users
    CredentialsProvider({
      id: 'credentials',
      name: 'Demo Account',
      credentials: {
        email: { label: 'Email', type: 'email' }
      },
      async authorize(credentials) {
        if (!credentials?.email) return null
        
        const testUser = testUsers.find(user => user.email === credentials.email)
        if (testUser) {
          return {
            id: testUser.id,
            email: testUser.email,
            name: testUser.name,
            role: testUser.role,
            status: testUser.status
          }
        }
        
        return null
      }
    }),
    
    // Social providers (only if environment variables are set)
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? [
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })
    ] : []),
    
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? [
      GitHubProvider({
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      })
    ] : [])
  ],
  
  callbacks: {
    async signIn({ user, account, profile }) {
      // Always allow sign in (database operations moved to separate service)
      return true
    },
    
    async jwt({ token, user, account }) {
      if (user) {
        // Check test users first
        const testUser = testUsers.find(tu => tu.email === user.email)
        if (testUser) {
          token.role = testUser.role
          token.status = testUser.status
          token.userId = testUser.id
        } else {
          // For social sign-ins, set defaults (database sync happens separately)
          token.role = 'RETAIL_TRADER'
          token.status = 'ACTIVE'
          token.userId = user.id || account?.providerAccountId || 'new-user'
        }
      }
      return token
    },
    
    async session({ session, token }) {
      if (token) {
        session.user.id = token.userId as string
        session.user.role = token.role as string
        session.user.status = token.status as string
      }
      return session
    }
  },
  
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  
  // Enhanced error handling
  logger: {
    error(code, metadata) {
      console.error('NextAuth Error:', code, metadata)
    },
    warn(code) {
      console.warn('NextAuth Warning:', code)
    },
    debug(code, metadata) {
      if (process.env.NODE_ENV === 'development') {
        console.log('NextAuth Debug:', code, metadata)
      }
    }
  }
}

// Utility functions for user management (separate from auth)
export async function syncUserToDatabase(user: any) {
  // This runs separately from authentication to avoid blocking sign-in
  try {
    const { connectToDatabase } = await import('./database/runtime-connection')
    const User = (await import('./database/models/User')).default
    
    const connection = await connectToDatabase()
    if (!connection) return false
    
    let existingUser = await User.findByEmail(user.email)
    
    if (!existingUser) {
      existingUser = new User({
        email: user.email,
        name: user.name || '',
        image: user.image || '',
        role: 'RETAIL_TRADER',
        status: 'ACTIVE',
        preferences: {
          theme: 'dark',
          notifications: true,
          intelligenceLevel: 'standard'
        }
      })
      await existingUser.save()
      console.log('✅ New user synced to database:', user.email)
    }
    
    return true
  } catch (error) {
    console.error('❌ User sync error:', error)
    return false
  }
}

export function hasPermission(userRole: string, requiredRole: string): boolean {
  const roleHierarchy: Record<string, number> = {
    'SUPER_ADMIN': 4,
    'INSTITUTIONAL_TRADER': 3,
    'RETAIL_TRADER': 2,
    'PENDING': 1
  }
  
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole]
}