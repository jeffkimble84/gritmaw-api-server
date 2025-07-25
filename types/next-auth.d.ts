/**
 * NextAuth Type Extensions
 * Extends default NextAuth types with our custom fields
 */

import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      role: string
      status: string
    }
  }

  interface User {
    role: string
    status: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string
    role: string
    status: string
  }
}

// Extend global types for mongoose caching
declare global {
  var mongoose: {
    conn: any
    promise: any
  }
}