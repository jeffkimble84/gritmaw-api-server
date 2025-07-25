#!/bin/bash
set -e

echo "Starting Railway build process..."

# Remove any existing node_modules and package-lock
rm -rf node_modules package-lock.json

# Fresh install with npm install
echo "Installing dependencies..."
npm install --production=false

# Build the project
echo "Building project..."
npm run build

echo "Build completed successfully!"