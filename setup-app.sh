#!/bin/bash
# ============================================
# BluSanta Application Setup Script
# ============================================
# Run this after vm-setup.sh and copying files
# 
# Usage: 
#   chmod +x setup-app.sh
#   ./setup-app.sh
# ============================================

set -e  # Exit on any error

APP_DIR="/home/Dipesh_Goel/blusanta"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"

echo "============================================"
echo "🎅 BluSanta Application Setup"
echo "============================================"

# Check if directories exist
if [ ! -d "$BACKEND_DIR" ]; then
    echo "❌ Backend directory not found at $BACKEND_DIR"
    echo "Please copy the project files first."
    exit 1
fi

# Setup Backend
echo ""
echo "📦 Setting up Backend..."
cd $BACKEND_DIR

# Install dependencies
npm install

# Ensure data directory exists
mkdir -p data

# Check for service account key
if [ ! -f "data/service-account-key.json" ]; then
    echo "⚠️  WARNING: Service account key not found!"
    echo "   Please copy service-account-key.json to $BACKEND_DIR/data/"
fi

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  WARNING: .env file not found!"
    echo "   Copying from .env.example..."
    cp .env.example .env
    echo "   Please edit .env with your actual values!"
fi

echo "✅ Backend setup complete"

# Setup Frontend
echo ""
echo "📦 Setting up Frontend..."
cd $FRONTEND_DIR

# Install dependencies
npm install

# Build for production
echo "🔨 Building frontend for production..."
npm run build

echo "✅ Frontend setup complete"

# Setup PM2
echo ""
echo "🚀 Setting up PM2 process manager..."
cd $APP_DIR

# Create PM2 ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'blusanta-backend',
      cwd: './backend',
      script: 'index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log',
      time: true
    },
    {
      name: 'blusanta-frontend',
      cwd: './frontend',
      script: 'npm',
      args: 'start',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_file: './logs/frontend-combined.log',
      time: true
    }
  ]
};
EOF

# Create logs directory
mkdir -p logs

# Start applications with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd -u $USER --hp /home/$USER
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER

echo ""
echo "============================================"
echo "✅ BluSanta Application Setup Complete!"
echo "============================================"
echo ""
echo "🌐 Frontend running at: http://$(curl -s ifconfig.me):3000"
echo "🔧 Backend running at:  http://$(curl -s ifconfig.me):3001"
echo ""
echo "📋 Useful PM2 commands:"
echo "   pm2 status          - Check app status"
echo "   pm2 logs            - View logs"
echo "   pm2 restart all     - Restart all apps"
echo "   pm2 stop all        - Stop all apps"
echo ""
echo "⚠️  Don't forget to:"
echo "   1. Update .env with your actual values (ElevenLabs API key, etc.)"
echo "   2. Copy service-account-key.json to backend/data/"
echo "   3. Update BACKEND_IP in .env with this VM's static IP"
echo "============================================"
