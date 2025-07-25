/**
 * Simple Health Check Endpoint (no database)
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    railway: !!process.env.RAILWAY_ENVIRONMENT,
    service: 'gritmaw-api-backend',
    version: '2.0.0'
  }, { status: 200 })
}