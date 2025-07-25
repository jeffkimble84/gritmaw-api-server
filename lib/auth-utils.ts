/**
 * Authentication Utilities
 * Helper functions for authentication and authorization
 */

import { getServerSession } from "next-auth/next"
import { NextRequest } from "next/server"
import { authOptions } from "./auth"

/**
 * Get the current session on the server side
 */
export async function getSession() {
  return await getServerSession(authOptions)
}

/**
 * Get session from API request
 */
export async function getSessionFromRequest(request: NextRequest) {
  // For API routes, we need to manually construct the session
  try {
    return await getServerSession(authOptions)
  } catch (error) {
    console.error('Error getting session from request:', error)
    return null
  }
}

/**
 * Check if user has required permission level
 */
export function checkPermission(userRole: string, requiredRole: string): boolean {
  const roleHierarchy: Record<string, number> = {
    'SUPER_ADMIN': 4,
    'INSTITUTIONAL_TRADER': 3,
    'RETAIL_TRADER': 2,
    'PENDING': 1
  }
  
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole]
}

/**
 * Authentication middleware for API routes
 */
export async function requireAuth(request: NextRequest, requiredRole: string = 'RETAIL_TRADER') {
  const session = await getSessionFromRequest(request)
  
  if (!session?.user) {
    return {
      success: false,
      error: 'Authentication required',
      status: 401
    }
  }

  if (!checkPermission(session.user.role, requiredRole)) {
    return {
      success: false,
      error: 'Insufficient permissions',
      status: 403
    }
  }

  return {
    success: true,
    user: session.user
  }
}

/**
 * Create standardized API responses
 */
export function createAuthResponse(success: boolean, data?: any, error?: string, status: number = 200) {
  return Response.json({
    success,
    data,
    error,
    timestamp: new Date().toISOString()
  }, { status })
}

/**
 * Get the current user session with full user data from database
 */
export async function getUserWithProfile(): Promise<{
  session: Awaited<ReturnType<typeof getSession>>
  user: any | null
}> {
  const session = await getSession()
  
  if (!session?.user?.id) {
    return { session: null, user: null }
  }

  try {
    const { User } = await import('@/lib/database/models')
    const { connectToDatabase } = await import('./database')
    await connectToDatabase()
    const user = await User.findById(session.user.id)
    return { session, user }
  } catch (error) {
    console.error('Error fetching user profile:', error)
    return { session, user: null }
  }
}

/**
 * Get user risk tolerance with fallback
 */
export function getUserRiskTolerance(user: any | null, userRole?: string): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (user?.tradingProfile?.riskTolerance) {
    return user.tradingProfile.riskTolerance
  }
  
  // Fallback based on role
  if (userRole === 'INSTITUTIONAL_TRADER') return 'HIGH'
  if (userRole === 'RETAIL_TRADER') return 'MEDIUM'
  return 'MEDIUM'
}

/**
 * Get user experience level with fallback
 */
export function getUserExperienceLevel(user: any | null, userRole?: string): 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' {
  // Map based on role since we don't have experienceLevel in our model
  if (userRole === 'INSTITUTIONAL_TRADER') return 'ADVANCED'
  if (userRole === 'RETAIL_TRADER') return 'INTERMEDIATE'
  return 'INTERMEDIATE'
}

/**
 * Common user profile for API responses
 */
export function formatUserProfile(user: any | null, session: any) {
  if (!user || !session) return null
  
  return {
    riskTolerance: getUserRiskTolerance(user, session.user.role),
    experienceLevel: getUserExperienceLevel(user, session.user.role),
    maxDailyLoss: user.tradingProfile?.maxDailyLoss || 1000,
    maxPortfolioRisk: user.tradingProfile?.maxPortfolioRisk || 2,
    preferredStrategies: user.tradingProfile?.preferredStrategies || []
  }
}