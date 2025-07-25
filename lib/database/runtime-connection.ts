/**
 * Railway-optimized MongoDB connection
 * Persistent connections with proper pooling
 */

import mongoose from 'mongoose'

// Singleton connection promise - optimized for Railway persistent containers
let connectionPromise: Promise<typeof mongoose> | null = null

export async function connectToDatabase() {
  // Only connect at runtime, never during build
  if (typeof window !== 'undefined') {
    throw new Error('Database connections only available on server side')
  }
  
  // Skip connection if no URI provided
  if (!process.env.MONGODB_URI && !process.env.MONGODB_URL) {
    console.warn('⚠️ MongoDB URI not set, skipping connection')
    return null
  }

  // Return existing connection if available
  if (mongoose.connection.readyState === 1) {
    return mongoose
  }

  // Create connection promise only once
  if (!connectionPromise) {
    const mongoUri = process.env.MONGODB_URL || process.env.MONGODB_URI!
    
    connectionPromise = mongoose.connect(mongoUri, {
      // Railway-optimized settings for persistent containers
      maxPoolSize: 20,        // Higher pool for persistent connections
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,  // Disable mongoose buffering
      maxIdleTimeMS: 30000,   // Close idle connections after 30s
      heartbeatFrequencyMS: 10000, // Check connection health every 10s
    })
  }

  try {
    const connection = await connectionPromise
    console.log('✅ Railway MongoDB connected successfully')
    
    // Set up connection event handlers
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err)
    })

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected')
      connectionPromise = null // Reset to allow reconnection
    })

    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected')
    })

    return connection
  } catch (error) {
    console.error('❌ Railway MongoDB connection failed:', error)
    connectionPromise = null // Reset on failure
    throw error
  }
}

// Graceful cleanup
export async function disconnectFromDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
    connectionPromise = null
    console.log('✅ Database disconnected')
  }
}