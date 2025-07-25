#!/bin/bash
set -e

echo "Starting Railway build process..."
echo "Current directory: $(pwd)"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# Remove any existing node_modules and package-lock to ensure clean state
echo "Cleaning previous build artifacts..."
rm -rf node_modules package-lock.json

# Fresh install with npm install (not ci)
echo "Installing dependencies with npm install..."
npm install --production=false --legacy-peer-deps

# Build the project
echo "Building Next.js project..."
npm run build

echo "Build completed successfully!"
echo "Ready to start with: npm start"