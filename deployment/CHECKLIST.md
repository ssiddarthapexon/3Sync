# 3Sync Deployment: Step-by-Step Checklist

## Phase 1: AWS EC2 Setup (15 minutes)

### Step 1.1: Launch EC2 Instance
- [ ] Go to AWS Management Console
- [ ] Click EC2 Dashboard
- [ ] Click "Launch Instance"
- [ ] Select **Ubuntu 22.04 LTS** (free tier)
- [ ] Instance Type: **t3.small** (2 vCPU, 2GB RAM)
- [ ] Click "Create new key pair" and download `.pem` file safely
- [ ] Storage: 20GB (default fine)
- [ ] Click "Launch"

### Step 1.2: Configure Security Group
- [ ] In EC2 Dashboard, find your instance
- [ ] Click on instance → Security → Security Groups
- [ ] Edit inbound rules to add:
  - 22/TCP (SSH) - Your IP only
  - 80/TCP (HTTP) - 0.0.0.0/0
  - 443/TCP (HTTPS) - 0.0.0.0/0
  - 3478/TCP (TURN) - 0.0.0.0/0
  - 3478/UDP (TURN) - 0.0.0.0/0
  - 5349/TCP (TURNS) - 0.0.0.0/0
  - 49152-65535/UDP (TURN relay) - 0.0.0.0/0
- [ ] Save security group

### Step 1.3: Get Public IP
- [ ] In EC2 Dashboard, find your instance
- [ ] Look for "Public IPv4 address" (e.g., `203.0.113.42`)
- [ ] **Copy this IP** — you'll need it for Cloudflare

### Step 1.4: SSH into Instance
- [ ] Open Terminal (Mac/Linux) or PowerShell (Windows)
- [ ] Run: `ssh -i path/to/your-key.pem ubuntu@<PUBLIC_IP>`
- [ ] Type `yes` to confirm host key
- [ ] You should see `ubuntu@ip-...~$` prompt

---

## Phase 2: Cloudflare DNS Setup (10 minutes)

### Step 2.1: Add Root Domain Record
- [ ] Go to Cloudflare Dashboard
- [ ] Select **sidzy.in** domain
- [ ] Go to **DNS** tab
- [ ] Click **Add Record**
- [ ] Fill:
  - Type: **A**
  - Name: **sidzy.in**
  - IPv4 address: [Your EC2 Public IP from Step 1.3]
  - TTL: **Auto**
  - Proxy Status: **DNS Only** (⚠️ GRAY CLOUD, not orange)
- [ ] Click **Save**

### Step 2.2: Add www Subdomain (Optional)
- [ ] Click **Add Record** again
- [ ] Fill:
  - Type: **A**
  - Name: **www**
  - IPv4 address: [Your EC2 Public IP]
  - TTL: **Auto**
  - Proxy Status: **DNS Only** (⚠️ GRAY CLOUD)
- [ ] Click **Save**

### Step 2.3: Verify DNS Propagation
- [ ] Wait **5-10 minutes**
- [ ] Open Terminal/PowerShell
- [ ] Run: `nslookup sidzy.in`
- [ ] Should return your EC2 Public IP
- [ ] If not resolved yet, wait longer and try again

---

## Phase 3: EC2 Deployment (20 minutes)

### Step 3.1: Prepare Files (still SSH'd in)
```bash
# You should be in: ubuntu@ip-...~$

# Download deployment files
cd ~
git clone <your-3sync-repo-url> 3Sync
# OR if no git repo, upload files manually via scp
```

### Step 3.2: Generate JWT Secret
```bash
# Generate a random 32+ character secret
openssl rand -base64 32
# Copy the output (e.g., AbCdEfGhIjKlMnOpQrStUvWxYz1234567890AB+/=)
```

### Step 3.3: Create Production .env File
```bash
cd ~/3Sync
cp deployment/.env.production.template .env
nano .env  # Or use vim/vi
```

Edit and set:
- `JWT_SECRET=` [paste from Step 3.2]
- `TURN_PASS=` [create strong password, e.g., Tr0ub4dor&3xkcd]
- `ORIGIN=https://sidzy.in`

Save and exit (Ctrl+X, then Y, then Enter for nano)

### Step 3.4: Run Deployment Script
```bash
cd ~/3Sync
chmod +x deployment/deploy.sh
sudo bash deployment/deploy.sh
```

The script will:
1. Update system
2. Install Node.js 20 LTS
3. Install npm dependencies
4. Configure nginx
5. Install Certbot and get SSL cert (will ask you to confirm DNS is set)
6. Install coturn
7. Start all services

**When prompted: "Press ENTER after DNS is configured"**
- Confirm DNS records are in Cloudflare (Step 2)
- Press ENTER to continue

---

## Phase 4: Verification (10 minutes)

### Step 4.1: Check Service Status
```bash
sudo systemctl status 3sync
sudo systemctl status nginx
sudo systemctl status coturn
```

All should show **"active (running)" in green**

### Step 4.2: Check Logs for Errors
```bash
sudo journalctl -u 3sync -n 20
# Should show: "🚀 Server running on http://localhost:3000"
```

### Step 4.3: Test HTTPS in Browser
- [ ] Open browser
- [ ] Go to: **https://sidzy.in**
- [ ] Should see **3Sync Login Page**
- [ ] Check for **green lock icon** (SSL valid)
- [ ] No warnings about security

### Step 4.4: Test Login
- [ ] Enter username: **sandesh**
- [ ] Enter password: **san22**
- [ ] Click "Join Call"
- [ ] Should see video call interface

### Step 4.5: Test Video Call (2 Users)
- [ ] Open second browser window (incognito)
- [ ] Go to **https://sidzy.in**
- [ ] Login as: **sonali** / **son27**
- [ ] Click "Join Call"
- [ ] In first browser, you should see video from second user
- [ ] In second browser, you should see video from first user
- [ ] Both should have camera feeds visible
- [ ] Test camera toggle, mic toggle, screen share

---

## Phase 5: Post-Deployment (Ongoing)

### Daily Monitoring
```bash
# Check all services running
sudo systemctl status 3sync nginx coturn

# Check server health
free -h        # Memory usage
df -h          # Disk space
top            # CPU usage (press q to exit)
```

### If Service Crashes
```bash
# Restart individual service
sudo systemctl restart 3sync
sudo systemctl restart nginx
sudo systemctl restart coturn

# Check why it crashed
sudo journalctl -u 3sync -f  # Follow logs in real-time
```

### SSL Certificate Auto-Renewal
Certbot automatically renews before expiration (no action needed). To verify:
```bash
sudo certbot renew --dry-run
```

### Update Application Code
If you make code changes:
```bash
cd ~/3Sync
git pull origin main  # Or manually copy new files
npm install --production  # If dependencies changed
sudo systemctl restart 3sync  # Reload app
```

---

## Troubleshooting Quick Reference

| Problem | Solution |
|---------|----------|
| Can't SSH | Check security group allows port 22, verify IP correct |
| DNS not resolving | Wait 5-10 min, verify DNS record in Cloudflare, check IP is correct |
| HTTPS shows warning | Wait for DNS propagation, check SSL cert issued correctly |
| Video calls not working | Check WebSocket connected in DevTools, verify TURN server running |
| High CPU usage | Check logs `journalctl -u 3sync -f`, consider upgrading instance |
| Disk space full | `df -h` to check, delete old logs if needed |

---

## Important Notes

⚠️ **CRITICAL**: Cloudflare DNS must be "DNS Only" (gray cloud), NOT orange proxy
- Orange proxy breaks WebRTC peer discovery
- P2P video calls require direct IP communication

🔒 **Security**: 
- SSH key should be kept private (never share .pem file)
- Firewall already restricts access
- SSL certificate auto-renews

🚀 **Performance**: 
- t3.small is sufficient for 50-100 concurrent users
- Upgrade to t3.medium if needed for larger groups

💾 **Backups**:
- User data not stored (stateless)
- Server config backed up, can recreate easily
- Consider backing up .env file if it has custom TURN credentials

---

## You're Done! 🎉

Your 3Sync application is now live at: **https://sidzy.in**

Users can:
1. Visit https://sidzy.in
2. Login with their credentials
3. Join video calls with P2P WebRTC + TURN fallback
4. Share screen at 50Mbps bitrate
5. Sustain calls for 4-5 hours with proper cleanup

---

## Next Steps (Optional)

- Monitor server logs regularly
- Set up email alerts for high CPU/disk usage
- Plan for database if you need call history
- Consider CloudFlare Workers for additional scaling
- Add monitoring (CloudWatch, DataDog, etc.)

**Questions?** Check DEPLOYMENT.md for detailed docs.
