#!/bin/bash
# ============================================
# BluSanta VM Setup Script
# ============================================
# Run this script on a fresh Ubuntu 22.04 VM on GCP
# 
# Usage: 
#   chmod +x vm-setup.sh
#   ./vm-setup.sh
# ============================================

set -e  # Exit on any error

echo "============================================"
echo "🎅 BluSanta VM Setup - Starting..."
echo "============================================"

# Update system
echo "📦 Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js 20.x
echo "📦 Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify Node.js installation
echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"

# Install PM2 globally
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install git
echo "📦 Installing git..."
sudo apt-get install -y git

# Create app directory
echo "📁 Creating application directory..."
sudo mkdir -p /home/ubuntu/blusanta
sudo chown -R $USER:$USER /home/ubuntu/blusanta

# Clone or copy the project files
# NOTE: You'll need to either:
# 1. Clone from git: git clone <your-repo-url> /home/ubuntu/blusanta
# 2. Or copy files manually using gcloud compute scp

echo "============================================"
echo "📋 Next Steps:"
echo "============================================"
echo ""
echo "1. Copy your project files to /home/ubuntu/blusanta/"
echo "   Using gcloud from your local machine:"
echo "   gcloud compute scp --recurse ./ErisBluSanta/* blusanta-campaign:/home/ubuntu/blusanta/ --zone=us-central1-c"
echo ""
echo "2. Copy the service account key:"
echo "   gcloud compute scp ./service-account-key.json blusanta-campaign:/home/ubuntu/blusanta/backend/data/ --zone=us-central1-c"
echo ""
echo "3. Then run the application setup:"
echo "   cd /home/ubuntu/blusanta"
echo "   ./setup-app.sh"
echo ""
echo "============================================"
