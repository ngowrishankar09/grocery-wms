#!/bin/bash
# Run this ONCE on a fresh Ubuntu 22.04 VPS as root
# Usage: bash setup-server.sh

set -e

echo "=== Installing system packages ==="
apt update && apt upgrade -y
apt install -y nginx python3 python3-pip python3-venv certbot python3-certbot-nginx git

echo "=== Creating app directory ==="
mkdir -p /var/www/rapiddockwms
cd /var/www/rapiddockwms

echo "=== Cloning repo (or upload your files here) ==="
# If using git:
# git clone https://github.com/YOUR_USERNAME/grocery-wms.git .
# OR: scp your files up

echo "=== Python virtual environment ==="
python3 -m venv venv
venv/bin/pip install --upgrade pip
venv/bin/pip install -r backend/requirements.txt

echo "=== Create .env file ==="
echo "Copy deploy/env.example to /var/www/rapiddockwms/.env and fill in DATABASE_URL and SECRET_KEY"
echo "Then press Enter to continue..."
read

echo "=== Build frontend ==="
apt install -y nodejs npm
cd frontend && npm install && npm run build && cd ..

echo "=== nginx config ==="
cp deploy/nginx.conf /etc/nginx/sites-available/rapiddockwms
ln -sf /etc/nginx/sites-available/rapiddockwms /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "=== systemd service ==="
cp deploy/rapiddockwms.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable rapiddockwms
systemctl start rapiddockwms

echo "=== SSL certificate (Let's Encrypt — FREE) ==="
certbot --nginx -d rapiddockwms.com -d www.rapiddockwms.com

echo ""
echo "✅ Done! RapidDock WMS is live at https://rapiddockwms.com"
