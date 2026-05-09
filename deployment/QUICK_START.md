# 3Sync Deployment: Quick Start Card

## Your Domain & Credentials

```
Domain:              sidzy.in (hosted on Cloudflare)
App URL:             https://sidzy.in
Test User 1:         sandesh / san22
Test User 2:         sonali / son27
```

---

## Phase 1: AWS EC2 (15 min)

1. **Launch Instance**
   - AMI: Ubuntu 22.04 LTS
   - Type: t3.small
   - Storage: 20GB
   - Create key pair & download .pem

2. **Security Group**
   ```
   22/TCP   → Your IP only
   80/TCP   → 0.0.0.0/0
   443/TCP  → 0.0.0.0/0
   3478/TCP,UDP → 0.0.0.0/0
   5349/TCP → 0.0.0.0/0
   49152-65535/UDP → 0.0.0.0/0
   ```

3. **Get Public IP**
   - Copy the EC2 Public IPv4 address (e.g., 203.0.113.42)

4. **SSH**
   ```bash
   ssh -i your-key.pem ubuntu@<PUBLIC_IP>
   ```

---

## Phase 2: Cloudflare DNS (10 min)

Add to **sidzy.in** DNS records:

```
Record 1:
Type:   A
Name:   sidzy.in
Value:  [Your EC2 Public IP]
Proxy:  DNS Only (⚠️ GRAY CLOUD)

Record 2 (optional):
Type:   A
Name:   www
Value:  [Your EC2 Public IP]
Proxy:  DNS Only (⚠️ GRAY CLOUD)
```

**Wait 5-10 minutes for propagation**

Test:
```bash
nslookup sidzy.in  # Should return your EC2 IP
```

---

## Phase 3: EC2 Deployment (20 min)

SSH'd in as ubuntu:

```bash
# Clone repo
cd ~
git clone <your-repo> 3Sync
cd 3Sync

# Generate JWT secret
openssl rand -base64 32
# Copy the output

# Create .env
cp deployment/.env.production.template .env
nano .env
# Set: JWT_SECRET=<paste above>
#      TURN_PASS=<strong password>
#      ORIGIN=https://sidzy.in

# Run deploy script
chmod +x deployment/deploy.sh
sudo bash deployment/deploy.sh

# When prompted: Confirm DNS is set in Cloudflare, then press ENTER
```

---

## Phase 4: Verification (10 min)

```bash
# Check services
sudo systemctl status 3sync nginx coturn
# All should be: active (running)

# Open browser
# Go to: https://sidzy.in
# Should see: 3Sync Login page + green lock icon

# Test login
# Username: sandesh
# Password: san22
# Click: Join Call

# Test video (2 browsers)
# Browser 1: sandesh login
# Browser 2: sonali login
# Both should see each other's video
```

---

## DNS Records to Add (Reference)

When deployment script asks for domain, provide:

```
To Cloudflare DNS for sidzy.in:

A Record #1
├─ Type: A
├─ Name: sidzy.in
├─ Content: [Your EC2 Public IP]
├─ TTL: Auto
└─ Proxy: DNS Only (GRAY CLOUD - Critical!)

A Record #2 (optional)
├─ Type: A
├─ Name: www
├─ Content: [Your EC2 Public IP]
├─ TTL: Auto
└─ Proxy: DNS Only (GRAY CLOUD - Critical!)
```

⚠️ **CRITICAL**: Both must be "DNS Only" (gray cloud), not Cloudflare proxy (orange cloud)
- Orange proxy breaks WebRTC P2P by hiding real IPs
- Gray cloud allows direct DNS lookup → WebRTC works perfectly

---

## Ongoing Maintenance

```bash
# Check health daily
sudo systemctl status 3sync nginx coturn
free -h && df -h

# View logs
sudo journalctl -u 3sync -f

# Restart if needed
sudo systemctl restart 3sync

# SSL auto-renews (no action needed)
sudo certbot renew --dry-run

# Update code
cd ~/3Sync && git pull && npm install --production
sudo systemctl restart 3sync
```

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| Can't access https://sidzy.in | (1) DNS records added? (2) EC2 running? (3) Security group open? |
| SSL warning | DNS need 5-10 min to propagate |
| No video between users | (1) Logs: `journalctl -u 3sync -f` (2) TURN running? |
| High CPU | Check `top`, restart with `systemctl restart 3sync` |

---

## Your Setup Summary

✅ **Domain**: sidzy.in on Cloudflare (DNS Only)
✅ **Server**: EC2 t3.small (Ubuntu 22.04 LTS)
✅ **App**: Node.js 20 + Socket.io
✅ **Reverse Proxy**: nginx (SSL termination)
✅ **SSL**: Let's Encrypt (auto-renewing)
✅ **TURN Server**: coturn (NAT fallback)
✅ **P2P**: WebRTC full mesh topology
✅ **Users**: 5 configured (sandesh, sonali, siddarth, ishaan, yashas)

---

## Performance Specs

| Metric | Value |
|--------|-------|
| Camera Bitrate | 2.5 Mbps |
| Screen Share Bitrate | 50 Mbps |
| P2P Latency (LAN) | <100ms |
| Max Call Duration | 4-5 hours |
| Connection Timeout | 60s (Socket.io) |

---

## Files You Have

```
deployment/
├── DEPLOYMENT.md          ← Full deployment guide
├── CHECKLIST.md          ← Step-by-step checklist
├── CLOUDFLARE_DNS.md     ← DNS setup guide (you're reading this!)
├── deploy.sh             ← Automated deploy script
├── nginx.conf            ← Reverse proxy config
├── turnserver.conf       ← TURN server config
├── 3sync.service         ← Systemd service
└── .env.production.template ← Production env template
```

---

## Need Help?

1. **Deployment issues**: Check DEPLOYMENT.md
2. **DNS issues**: Check CLOUDFLARE_DNS.md
3. **Step-by-step**: Follow CHECKLIST.md
4. **Server logs**: `sudo journalctl -u 3sync -f`
5. **Nginx logs**: `sudo tail -f /var/log/nginx/error.log`
6. **TURN logs**: `sudo tail -f /var/log/coturn/turnserver.log`

---

Ready to deploy? Start with Phase 1! 🚀
