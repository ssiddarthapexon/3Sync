# 3Sync Deployment: Copy-Paste Reference

This file contains all commands and configurations ready to copy-paste. Use this as a quick reference during deployment.

---

## Generate JWT Secret (Run Once)

```bash
openssl rand -base64 32
```

**Example output** (copy this into .env JWT_SECRET):
```
xK7mP2q9F0nL8vW5bY3dH6jR1cE4gT9uO2sA7zM5
```

---

## Production .env File Template

Copy this into `/home/ubuntu/3Sync/.env` on EC2:

```bash
# 3Sync Production Configuration
PORT=3000
NODE_ENV=production
ORIGIN=https://sidzy.in

# JWT (generate with: openssl rand -base64 32)
JWT_SECRET=xK7mP2q9F0nL8vW5bY3dH6jR1cE4gT9uO2sA7zM5

# Users
USERS=sandy:san22,sonzy:son27,sidzy:sid06,ishaan:ish11,yashas:yas03

# TURN Server
TURN_HOST=sidzy.in
TURN_PORT=3478
TURN_SECURE_PORT=5349
TURN_USER=turnuser
TURN_PASS=Tr0ub4dor&3xkcd

# STUN
STUN_SERVERS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302

# Logging
LOG_LEVEL=info
```

---

## Cloudflare A Record #1 (Root Domain)

```
Type:           A
Name:           sidzy.in
IPv4 address:   [Your EC2 Public IP]
TTL:            Auto
Proxy Status:   DNS Only ← GRAY CLOUD (CRITICAL!)
```

---

## Cloudflare A Record #2 (www Subdomain - Optional)

```
Type:           A
Name:           www
IPv4 address:   [Your EC2 Public IP]
TTL:            Auto
Proxy Status:   DNS Only ← GRAY CLOUD (CRITICAL!)
```

---

## EC2 Security Group Rules

Add these inbound rules:

| Type | Protocol | Port Range | Source | Purpose |
|------|----------|-----------|--------|---------|
| SSH | TCP | 22 | YOUR_IP_ONLY | Remote access |
| HTTP | TCP | 80 | 0.0.0.0/0 | HTTP redirect |
| HTTPS | TCP | 443 | 0.0.0.0/0 | HTTPS main app |
| Custom TCP | TCP | 3478 | 0.0.0.0/0 | TURN TCP |
| Custom UDP | UDP | 3478 | 0.0.0.0/0 | TURN UDP |
| Custom TCP | TCP | 5349 | 0.0.0.0/0 | TURNS TLS |
| Custom UDP | UDP | 49152-65535 | 0.0.0.0/0 | TURN relay range |

---

## SSH into EC2

```bash
# Replace: your-key.pem and PUBLIC_IP
ssh -i ~/path/to/your-key.pem ubuntu@203.0.113.42
```

---

## Clone Repo & Setup

```bash
# (Run on EC2 after SSH)
cd ~
git clone https://github.com/yourusername/3Sync.git 3Sync
cd 3Sync
npm install --production
```

---

## Create Production .env

```bash
# (Run on EC2)
cd ~/3Sync
cp deployment/.env.production.template .env
nano .env
# Paste the template above, edit JWT_SECRET and TURN_PASS
# Save: Ctrl+X, Y, Enter
```

---

## Run Deployment Script

```bash
# (Run on EC2)
cd ~/3Sync
chmod +x deployment/deploy.sh
sudo bash deployment/deploy.sh

# When asked: Confirm DNS records are in Cloudflare, press ENTER
```

---

## Post-Deployment Verification

```bash
# Check all services running
sudo systemctl status 3sync
sudo systemctl status nginx
sudo systemctl status coturn

# View Node.js logs
sudo journalctl -u 3sync -n 50

# View nginx access logs
sudo tail -f /var/log/nginx/access.log

# View nginx error logs
sudo tail -f /var/log/nginx/error.log

# View TURN logs
sudo tail -f /var/log/coturn/turnserver.log

# Test DNS resolution
nslookup sidzy.in
dig sidzy.in

# Test HTTPS
curl -I https://sidzy.in

# Test WebSocket connection
curl -I -H "Upgrade: websocket" https://sidzy.in
```

---

## Restart Services

```bash
# Restart 3Sync app
sudo systemctl restart 3sync

# Restart nginx
sudo systemctl restart nginx

# Restart TURN
sudo systemctl restart coturn

# Restart all
sudo systemctl restart 3sync nginx coturn
```

---

## Check Server Health

```bash
# Memory usage
free -h

# Disk usage
df -h

# CPU usage
top
# Press 'q' to quit

# Running processes
ps aux | grep node
ps aux | grep nginx
ps aux | grep coturn

# Network connections
netstat -tulpn | grep LISTEN
```

---

## Update Application Code

```bash
cd ~/3Sync
git pull origin main
npm install --production
sudo systemctl restart 3sync

# Or if not using git, manually copy files and:
sudo systemctl restart 3sync
```

---

## Certbot SSL Certificate

```bash
# Verify certificate
sudo certbot certificates

# Renew manually (normally auto)
sudo certbot renew

# Test renewal (dry run)
sudo certbot renew --dry-run

# Update TURN cert symlinks if needed
sudo certbot renew --deploy-hook "sudo systemctl restart coturn"
```

---

## Nginx Configuration Validation

```bash
# Test config syntax
sudo nginx -t

# Reload nginx (without restarting)
sudo nginx -s reload

# Restart nginx
sudo systemctl restart nginx
```

---

## View Journal Logs

```bash
# Last 20 lines
sudo journalctl -u 3sync -n 20

# Follow in real-time (-f = follow)
sudo journalctl -u 3sync -f

# Last 1 hour
sudo journalctl -u 3sync --since "1 hour ago"

# With timestamps
sudo journalctl -u 3sync -o short-precise
```

---

## Troubleshoot Port Conflicts

```bash
# See what's using port 3000
sudo lsof -i :3000

# See what's using port 80/443
sudo lsof -i :80
sudo lsof -i :443

# See what's using port 3478
sudo lsof -i :3478

# Kill process using a port (example: port 3000)
sudo kill -9 <PID>
```

---

## Reset Application (Emergency)

```bash
# Stop all services
sudo systemctl stop 3sync nginx coturn

# Clear logs
sudo journalctl --vacuum-time=1d

# Restart everything
sudo systemctl start coturn
sudo systemctl start nginx
sudo systemctl start 3sync

# Verify
sudo systemctl status 3sync nginx coturn
```

---

## Backup Application

```bash
# Backup entire app directory
tar -czf ~/3Sync-backup-$(date +%Y%m%d).tar.gz ~/3Sync

# Backup just .env (KEEP SAFE!)
cp ~/3Sync/.env ~/3Sync/.env.backup

# List backups
ls -la ~/*.tar.gz
```

---

## Restore from Backup

```bash
# Extract backup
tar -xzf ~/3Sync-backup-20240509.tar.gz -C ~/

# Restart app
sudo systemctl restart 3sync
```

---

## SSH Troubleshooting

```bash
# Can't connect via SSH?
# Check if SSH port 22 is open in security group

# SSH with verbose output
ssh -v -i ~/path/to/your-key.pem ubuntu@203.0.113.42

# Fix key permissions (if needed)
chmod 600 ~/path/to/your-key.pem

# Check if instance is running
# (In AWS Console)
```

---

## DNS Troubleshooting

```bash
# Test DNS resolution
nslookup sidzy.in

# Use Cloudflare nameserver directly
nslookup sidzy.in 1.1.1.1

# Check DNS propagation globally
# Visit: https://www.whatsmydns.net/

# Flush local DNS cache (Mac)
sudo dscacheutil -flushcache

# Flush local DNS cache (Windows - PowerShell admin)
Clear-DnsClientCache

# Flush local DNS cache (Linux)
sudo systemctl restart systemd-resolved
```

---

## SSL Certificate Troubleshooting

```bash
# View certificate details
sudo certbot show-cert

# Check certificate expiration
echo | openssl s_client -servername sidzy.in -connect sidzy.in:443 2>/dev/null | grep "notAfter"

# Force certificate renewal
sudo certbot renew --force-renewal

# View renewal logs
sudo tail -f /var/log/letsencrypt/letsencrypt.log
```

---

## Uninstall/Remove Everything

```bash
# CAUTION: This removes the app completely

# Stop services
sudo systemctl stop 3sync nginx coturn
sudo systemctl disable 3sync nginx coturn

# Remove systemd service
sudo rm /etc/systemd/system/3sync.service
sudo systemctl daemon-reload

# Remove app directory
rm -rf ~/3Sync

# Remove nginx config
sudo rm /etc/nginx/sites-available/3sync /etc/nginx/sites-enabled/3sync

# (Don't remove nginx, coturn, Node.js if you plan to redeploy)
```

---

## Test Commands for Verification

```bash
# Test HTTPS connection
curl https://sidzy.in

# Test HTML response
curl -s https://sidzy.in | head -20

# Test Socket.io endpoint
curl -I -H "Connection: Upgrade" https://sidzy.in/socket.io/

# Test DNS + HTTPS together
curl -w "\n%{http_code}\n" https://sidzy.in

# Verify certificate chain
openssl s_client -connect sidzy.in:443 -showcerts </dev/null

# Check response headers
curl -I https://sidzy.in
```

---

## AWS EC2 Spot Check

```bash
# Check instance status (in AWS Console)
# Or via AWS CLI:

# List instances
aws ec2 describe-instances --region us-east-1

# Get instance details
aws ec2 describe-instances --instance-ids i-1234567890abcdef0

# Check security group
aws ec2 describe-security-groups --group-ids sg-1234567890abcdef0
```

---

## Performance Monitoring

```bash
# CPU and Memory usage
top -b -n 1 | head -20

# Memory breakdown
free -h

# Disk I/O
iostat -x 1 5

# Network traffic
netstat -an | grep ESTABLISHED | wc -l

# Node.js process memory
ps aux | grep "node server.js"

# Number of WebSocket connections
sudo netstat -an | grep :3000 | grep ESTABLISHED | wc -l
```

---

Use this file as a quick reference while deploying. Copy commands directly as needed!
