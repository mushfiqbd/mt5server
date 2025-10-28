#!/bin/bash

# Silver Pro Server Deployment Script
# This script helps deploy the server to production

set -e

echo "🚀 Silver Pro Server Deployment Script"
echo "========================================"

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version check passed"

# Install dependencies
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
else
    echo "✅ Dependencies already installed"
fi

# Check .env file
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your configuration!"
fi

# Initialize database if not exists
if [ ! -f "silverpro.db" ]; then
    echo "📊 Initializing database..."
    # Database will be initialized on first run
fi

# Run production build (if needed)
echo "✅ Setup complete!"
echo ""
echo "To start the server:"
echo "  npm start          # Production mode"
echo "  npm run dev        # Development mode with auto-reload"
echo ""
echo "To run with PM2:"
echo "  pm2 start server.js --name silverpro"
echo "  pm2 save"
echo "  pm2 startup"
echo ""

