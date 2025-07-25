/**
 * Database Layer Index
 * Main entry point for database operations
 */

import connectToDatabase from './connection'

export { connectToDatabase }
export * from './models'

// Database utilities
export const withDatabase = async <T>(operation: () => Promise<T>): Promise<T> => {
  await connectToDatabase()
  return operation()
}