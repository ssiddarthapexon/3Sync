#!/bin/bash
# 3Sync AWS EC2 Deployment Script
# This script automates the setup of Node.js, nginx, SSL, and coturn on Ubuntu 22.04 LTS
# Run as: bash deploy.sh

set -e  # Exit on any error

echo "=========================================="
echo "3Sync AWS EC2 Deployment Script"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'  # No Color

# Step 1: Update system packages
echo -e "${BLUE}[1/10]${NC} Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Step 2: Install Node.js 20 LTS via nvm
echo -e "${BLUE}[2/10]${NC} Installing Node.js 20 LTS..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
node -v && npm -v

# Step 3: Verify repo and install dependencies
echo -e "${BLUE}[3/10]${NC} Setting up 3Sync application..."
# Check if we're already in the repo (has deployment/deploy.sh)
if [ ! -f "deployment/deploy.sh" ]; then
    # Not in repo, clone it
    cd $HOME
    if ! git clone https://github.com/yourusername/3Sync.git; then
        echo -e "${YELLOW}❌ ERROR: Git URL is placeholder. Update to your actual repo URL in deploy.sh line 37${NC}"
        exit 1
    fi
    cd 3Sync
else
    # Already in repo directory, good!
    echo "Already in 3Sync directory, skipping clone"
fi
npm install --production

# Step 4: Create production .env file
echo -e "${BLUE}[4/10]${NC} Creating .env configuration..."
if [ ! -f .env ]; then
    cat deployment/.env.production.template > .env
    echo -e "${YELLOW}⚠️  IMPORTANT: Edit $HOME/3Sync/.env and set:${NC}"
    echo "   - JWT_SECRET (generate with: openssl rand -base64 32)"
    echo "   - TURN_PASS (use strong password)"
    echo "   Then re-run this script after editing."
    exit 1
fi

# Step 5: Install nginx
echo -e "${BLUE}[5/10]${NC} Installing nginx..."
sudo apt-get install -y nginx

# Step 6: Configure nginx reverse proxy
echo -e "${BLUE}[6/10]${NC} Configuring nginx..."
sudo cp deployment/nginx.conf /etc/nginx/sites-available/3sync
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/3sync /etc/nginx/sites-enabled/3sync
sudo nginx -t
echo -e "${GREEN}✓ nginx configured${NC}"

# Step 7: Install Certbot and get Let's Encrypt SSL
echo -e "${BLUE}[7/10]${NC} Installing Certbot for SSL..."
sudo apt-get install -y certbot python3-certbot-nginx

echo -e "${YELLOW}⚠️  WAIT:${NC}"
echo "   Before proceeding, ensure DNS records are set:"
echo "   - Type: A"
echo "   - Name: sidzy.in"
echo "   - Value: [Your EC2 Public IP]"
echo "   - Proxy Status: DNS Only (Cloudflare)"
echo ""
read -p "   Press ENTER after DNS is configured (wait 5-10 min for propagation)... "

echo -e "${BLUE}Getting SSL certificate...${NC}"
sudo certbot certonly --nginx -d sidzy.in -d www.sidzy.in --non-interactive --agree-tos -m webmaster@sidzy.in

# Step 8: Install coturn TURN server
echo -e "${BLUE}[8/10]${NC} Installing coturn..."
sudo apt-get install -y coturn
sudo cp deployment/turnserver.conf /etc/turnserver.conf
sudo chown turnserver:turnserver /etc/turnserver.conf
sudo chmod 640 /etc/turnserver.conf
echo "TURNSERVER_ENABLED=1" | sudo tee /etc/default/coturn > /dev/null

# Step 9: Set up systemd service for Node.js app
echo -e "${BLUE}[9/10]${NC} Setting up systemd service..."
sudo cp deployment/3sync.service /etc/systemd/system/
sudo systemctl daemon-reload

# Step 10: Start all services
echo -e "${BLUE}[10/10]${NC} Starting all services..."
sudo systemctl enable --now nginx
sudo systemctl enable --now coturn
sudo systemctl enable --now 3sync  # Start Node.js app last after other services ready

echo ""
echo -e "${GREEN}=========================================="
echo "✓ Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "Your app is now running at: https://sidzy.in"
echo ""
echo "Verify services are running:"
echo "   sudo systemctl status 3sync"
echo "   sudo systemctl status nginx"
echo "   sudo systemctl status coturn"
echo ""
echo "Check logs:"
echo "   sudo journalctl -u 3sync -f"
echo "   sudo journalctl -u nginx -f"
echo "   sudo tail -f /var/log/coturn/turnserver.log"
echo ""
