/**
 * User Profile API Route
 * GET /api/user/profile - Get user profile
 * PUT /api/user/profile - Update user profile
 */

import { NextRequest } from 'next/server'
import { requireAuth, createAuthResponse } from '@/lib/auth-utils'
import { withDatabase, User } from '@/lib/database'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.success) {
    return createAuthResponse(false, null, auth.error, auth.status)
  }

  try {
    const user = await withDatabase(() =>
      User.findById(auth.user!.id).select('-__v')
    )

    if (!user) {
      return createAuthResponse(false, null, 'User not found', 404)
    }

    return createAuthResponse(true, {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      tradingProfile: user.tradingProfile,
      preferences: user.preferences,
      createdAt: user.createdAt
    })
  } catch (error) {
    console.error('Error fetching user profile:', error)
    return createAuthResponse(
      false,
      null,
      'Failed to fetch user profile',
      500
    )
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.success) {
    return createAuthResponse(false, null, auth.error, auth.status)
  }

  try {
    const body = await request.json()
    const { name, tradingProfile, preferences } = body

    const user = await withDatabase(() => User.findById(auth.user!.id))

    if (!user) {
      return createAuthResponse(false, null, 'User not found', 404)
    }

    // Update allowed fields
    if (name !== undefined) user.name = name
    if (tradingProfile) {
      user.tradingProfile = { ...user.tradingProfile, ...tradingProfile }
    }
    if (preferences) {
      user.preferences = { ...user.preferences, ...preferences }
    }

    const updatedUser = await withDatabase(() => user.save())

    return createAuthResponse(true, {
      id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      status: updatedUser.status,
      tradingProfile: updatedUser.tradingProfile,
      preferences: updatedUser.preferences,
      updatedAt: updatedUser.updatedAt
    }, 'Profile updated successfully')
  } catch (error) {
    console.error('Error updating user profile:', error)
    return createAuthResponse(
      false,
      null,
      'Failed to update profile',
      500
    )
  }
}