# 3Sync AWS EC2 Deployment Guide

## Overview
This guide walks you through deploying 3Sync to AWS EC2 with nginx reverse proxy, Let's Encrypt SSL, and coturn TURN server. Your domain is **sidzy.in** on Cloudflare.

---

## Step 1: Create AWS EC2 Instance

### 1.1 Launch Instance
1. Go to **AWS Management Console** → **EC2 Dashboard**
2. Click **Launch Instance**
3. Configure:
   - **Name**: 3Sync-Server
   - **AMI**: Ubuntu Server 22.04 LTS (free tier eligible)
   - **Instance Type**: t3.small (2 vCPU, 2GB RAM) — sufficient for 4-5 hour calls
   - **Key Pair**: Create new or use existing
   - **Storage**: 20GB gp3 (free tier default)

### 1.2 Configure Security Group
Create a new security group with these inbound rules:

| Protocol | Port(s)        | Source      | Purpose |
|----------|----------------|-------------|---------|
| TCP      | 22             | Your IP     | SSH access |
| TCP      | 80             | 0.0.0.0/0   | HTTP (redirects to HTTPS) |
| TCP      | 443            | 0.0.0.0/0   | HTTPS (main app) |
| TCP      | 3478           | 0.0.0.0/0   | TURN TCP |
| UDP      | 3478           | 0.0.0.0/0   | TURN UDP |
| TCP      | 5349           | 0.0.0.0/0   | TURNS (TLS) |
| UDP      | 49152-65535    | 0.0.0.0/0   | TURN relay range |

### 1.3 Launch & Connect
1. Click **Launch**
2. Once running, note the **Public IP address** (e.g., `203.0.113.42`)
3. SSH into the instance:
   ```bash
   ssh -i your-key.pem ubuntu@<PUBLIC_IP>
   ```

---

## Step 2: Add DNS Records to Cloudflare

**IMPORTANT: Do this BEFORE running SSL setup**

### 2.1 Add A Record for Root Domain
1. Go to **Cloudflare Dashboard** → **sidzy.in**
2. Navigate to **DNS** tab
3. Click **Add Record**
4. Fill in:
   - **Type**: A
   - **Name**: sidzy.in (root)
   - **IPv4 address**: [Your EC2 Public IP from Step 1.3]
   - **TTL**: Auto
   - **Proxy Status**: ⚠️ **DNS Only** (NOT orange cloud — critical for WebRTC)
5. Click **Save**

### 2.2 Add A Record for www Subdomain (Optional but Recommended)
1. Click **Add Record** again
2. Fill in:
   - **Type**: A
   - **Name**: www
   - **IPv4 address**: [Your EC2 Public IP]
   - **TTL**: Auto
   - **Proxy Status**: DNS Only
3. Click **Save**

### 2.3 Wait for DNS Propagation
- DNS changes take 5-10 minutes to propagate
- Test with: `nslookup sidzy.in` (should return your EC2 IP)
- Or: `ping sidzy.in` (should resolve to your IP)

---

## Step 3: Deploy to EC2

### 3.1 Upload Deployment Files
While SSH'd into EC2:
```bash
# Create deployment directory
mkdir -p ~/3Sync/deployment
cd ~/3Sync

# Copy all files from your local 3Sync repo
# Option A: Git clone (if you have a repo)
cd ~/
git clone <your-repo-url> 3Sync
cd 3Sync

# Option B: Manual copy (if no git repo yet)
# Upload all files from local machine using scp
```

### 3.2 Update Server Configuration
Edit `/home/ubuntu/3Sync/server.js` and change:
```javascript
const ORIGIN = process.env.ORIGIN || 'https://sidzy.in';  // Changed from localhost:3000
```

Also update the environment variable in your `.env`:
```bash
ORIGIN=https://sidzy.in
```

### 3.3 Run Deployment Script
On the EC2 instance:
```bash
cd ~/3Sync
chmod +x deployment/deploy.sh
bash deployment/deploy.sh
```

**The script will:**
1. Update system packages
2. Install Node.js 20 LTS
3. Install npm dependencies
4. Configure nginx as reverse proxy
5. Install Certbot and issue Let's Encrypt SSL certificate
6. Install and configure coturn TURN server
7. Create systemd service for auto-restart
8. Start all services

### 3.4 Provide Configuration Values
The script will prompt for:
- **JWT_SECRET**: Generate with:
  ```bash
  openssl rand -base64 32
  ```
  Example: `AbCdEfGhIjKlMnOpQrStUvWxYz1234567890AB+/=`

- **TURN Password**: Create a strong password for TURN authentication
  Example: `Tr0ub4dor&3xkcd`

---

## Step 4: Verify Deployment

### 4.1 Check Service Status
```bash
sudo systemctl status 3sync
sudo systemctl status nginx
sudo systemctl status coturn
```

All three should show **active (running)**

### 4.2 Check Logs
```bash
# Node.js app logs
sudo journalctl -u 3sync -n 20 -f

# Nginx logs
sudo tail -f /var/log/nginx/error.log

# TURN logs
sudo tail -f /var/log/coturn/turnserver.log
```

### 4.3 Test HTTPS
Open browser and visit: **https://sidzy.in**
- Should show login page with green lock icon (SSL valid)
- No browser warnings

### 4.4 Test With Real Users
1. Open **https://sidzy.in** in two different browsers
2. Login with test credentials:
   - sandesh / san22
   - sonali / son27
3. Click "Join Call"
4. Test camera toggle, mic toggle, screen share
5. Both users should see video feeds (P2P connection established)

---

## Step 5: Production Checklist

- [ ] EC2 instance running (t3.small Ubuntu 22.04 LTS)
- [ ] Security group configured with all required ports
- [ ] DNS records added to Cloudflare (A records for sidzy.in and www)
- [ ] DNS propagation verified (5-10 min wait)
- [ ] Deployment script ran successfully
- [ ] All 3 services running (3sync, nginx, coturn)
- [ ] HTTPS working (green lock in browser)
- [ ] Test login and video call works
- [ ] SSL certificate valid (Let's Encrypt auto-renews)
- [ ] TURN server responding (check logs)

---

## Step 6: Post-Deployment Maintenance

### Auto-Renewal of SSL Certificate
Certbot automatically renews certificates (no action needed). To verify:
```bash
sudo certbot renew --dry-run
```

### Monitor Server Health
Check disk space:
```bash
df -h
```

Check memory usage:
```bash
free -h
```

### Restart Services (if needed)
```bash
sudo systemctl restart 3sync      # Restart Node.js app
sudo systemctl restart nginx      # Restart nginx
sudo systemctl restart coturn     # Restart TURN server
```

### Update Application Code
If you make code changes locally:
```bash
# On EC2
cd ~/3Sync
git pull origin main              # Or manual copy
npm install --production          # If dependencies changed
sudo systemctl restart 3sync      # Restart app to load new code
```

---

## Troubleshooting

### Issue: "Connection refused" when accessing https://sidzy.in
**Solution:**
1. Verify EC2 instance is running
2. Check security group allows port 443
3. Check nginx is running: `sudo systemctl status nginx`
4. Check Node.js app is running: `sudo systemctl status 3sync`

### Issue: SSL certificate errors
**Solution:**
1. Verify DNS records are pointing to correct IP: `nslookup sidzy.in`
2. Ensure Cloudflare DNS proxy is "DNS Only" (not orange cloud)
3. Certbot needs DNS to resolve: `ping sidzy.in` should work
4. Check certbot logs: `sudo journalctl -u certbot`

### Issue: WebRTC connections failing (no video)
**Solution:**
1. Verify TURN server is running: `sudo systemctl status coturn`
2. Check TURN logs: `sudo tail -f /var/log/coturn/turnserver.log`
3. Verify Socket.io connection: Open browser DevTools → Network → check WebSocket connected
4. Check app logs: `sudo journalctl -u 3sync -f`

### Issue: High CPU or Memory Usage
**Solution:**
1. Check which process: `top` or `htop`
2. Restart app: `sudo systemctl restart 3sync`
3. Consider upgrading to t3.medium if consistently high

---

## Cost Estimate (AWS)

| Service | Cost/Month |
|---------|------------|
| EC2 t3.small | $7 |
| EBS Storage (20GB) | $2 |
| Data Transfer (reasonable use) | $1-5 |
| **Total** | **~$10-15/month** |

(Assuming free tier not applicable; prices may vary by region)

---

## Support

For issues with:
- **AWS**: Check AWS documentation or contact AWS support
- **Certbot/SSL**: See https://certbot.eff.org/
- **nginx**: See https://nginx.org/en/docs/
- **coturn**: See https://github.com/coturn/coturn
- **3Sync app**: Check application logs

Good luck! 🚀
