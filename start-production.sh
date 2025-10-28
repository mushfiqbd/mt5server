#!/bin/bash

# Silver Pro Production Startup Script

echo "🚀 Starting Silver Pro Server in Production Mode"
echo "=================================================="

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

# Check .env file
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from example..."
    cp .env.example .env
    echo "⚠️  Please edit .env file before continuing!"
    read -p "Press enter to continue after editing .env..."
fi

# Load environment variables
set -a
source .env
set +a

# Initialize database if not exists
if [ ! -f silverpro.db ]; then
    echo "📊 Database not found. It will be created on first run."
fi

# Check if PM2 is installed
if command -v pm2 &> /dev/null; then
    echo "✅ PM2 detected. Starting with PM2..."
    pm2 start ecosystem.config.js --env production || pm2 restart silverpro-server
    pm2 save
    echo ""
    echo "✅ Server started with PM2"
    echo ""
    echo "Useful commands:"
    echo "  pm2 logs silverpro-server      # View logs"
    echo "  pm2 monit                        # Monitor resources"
    echo "  pm2 status                       # Check status"
    echo "  pm2 restart silverpro-server     # Restart server"
    echo ""
else
    echo "⚠️  PM2 not found. Starting without PM2..."
    echo "⚠️  Install PM2 for production: npm install -g pm2"
    echo ""
    echo "Starting server..."
    NODE_ENV=production node server.js
fi

