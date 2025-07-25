/**
 * Health Check Endpoint for Railway
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/database/runtime-connection'

export async function GET(request: NextRequest) {
  try {
    // Test database connection
    const connection = await connectToDatabase()
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      mongodb: connection ? 'connected' : 'disconnected',
      environment: process.env.NODE_ENV,
      railway: !!process.env.RAILWAY_ENVIRONMENT
    }
    
    return NextResponse.json(health, { status: 200 })
  } catch (error) {
    console.error('Health check failed:', error)
    
    const health = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      mongodb: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      environment: process.env.NODE_ENV,
      railway: !!process.env.RAILWAY_ENVIRONMENT
    }
    
    return NextResponse.json(health, { status: 500 })
  }
}