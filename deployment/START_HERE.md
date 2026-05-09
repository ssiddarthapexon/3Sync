# 3Sync Deployment: Start Here

## You Have Everything You Need! 🚀

All deployment files are ready in `/deployment/` folder. Here's what you have:

---

## 📚 Documentation Files (READ IN THIS ORDER)

| File | Purpose | Read Time |
|------|---------|-----------|
| **QUICK_START.md** | 1-page overview of all phases | 5 min |
| **CHECKLIST.md** | Step-by-step checklist to follow | 10 min |
| **CLOUDFLARE_DNS.md** | DNS records to add to Cloudflare | 5 min |
| **DEPLOYMENT.md** | Detailed technical guide | 20 min |
| **COPY_PASTE_REFERENCE.md** | Commands & configs ready to copy | As-needed |

---

## ⚙️ Configuration Files (AUTO-GENERATED, READY TO USE)

| File | Purpose | Location on EC2 |
|------|---------|-----------------|
| **nginx.conf** | Reverse proxy + SSL config | `/etc/nginx/sites-available/3sync` |
| **turnserver.conf** | TURN server config | `/etc/turnserver.conf` |
| **3sync.service** | Auto-restart service | `/etc/systemd/system/3sync.service` |
| **.env.production.template** | Production env vars | Copy to `/home/ubuntu/3Sync/.env` |

---

## 🔧 Automation Script

| File | Purpose |
|------|---------|
| **deploy.sh** | Fully automated deployment (installs everything, starts services) |

---

## 📋 Quick Overview: 4 Phases

### Phase 1: AWS EC2 Setup (15 min)
1. Launch t3.small Ubuntu 22.04 LTS instance
2. Configure security group with 7 port rules
3. Note down Public IP address
4. SSH in

**Start**: CHECKLIST.md → Phase 1

---

### Phase 2: Cloudflare DNS Setup (10 min)
1. Add A record for `sidzy.in` → your EC2 IP
2. Add A record for `www` → your EC2 IP
3. **CRITICAL**: Both must be "DNS Only" (gray cloud, NOT orange)
4. Wait 5-10 minutes for propagation

**Reference**: CLOUDFLARE_DNS.md (step-by-step with screenshots)

---

### Phase 3: EC2 Deployment (20 min)
1. Clone 3Sync repo
2. Generate JWT secret
3. Create .env with production values
4. Run `bash deployment/deploy.sh`
5. Script installs: Node.js 20, nginx, Let's Encrypt, coturn
6. Script starts all services automatically

**Commands**: COPY_PASTE_REFERENCE.md

---

### Phase 4: Verification (10 min)
1. Check services: `sudo systemctl status 3sync nginx coturn`
2. Test HTTPS: Open browser → https://sidzy.in
3. Login test: Use sandesh/san22
4. Video call test: 2 browsers, should see each other

**Troubleshooting**: DEPLOYMENT.md → "Troubleshooting" section

---

## 🚀 Start Right Now!

### If you're completely new to AWS:
→ **Read**: CHECKLIST.md (Phase 1)
→ Then follow each step

### If you're familiar with AWS:
→ **Read**: QUICK_START.md
→ Then reference COPY_PASTE_REFERENCE.md for commands

### If you get stuck:
→ **Check**: DEPLOYMENT.md → "Troubleshooting"
→ Or check specific docs: CLOUDFLARE_DNS.md, COPY_PASTE_REFERENCE.md

---

## ✅ Pre-Deployment Checklist

Before you start, ensure you have:

- [ ] AWS account (free tier OK)
- [ ] Cloudflare account with sidzy.in domain
- [ ] This laptop/computer with terminal/PowerShell
- [ ] All deployment files (in /deployment/ folder)
- [ ] 45 minutes (15+10+20 for phases 1-3)

---

## 📝 Important Notes

### Cloudflare DNS is CRITICAL
- Must be "DNS Only" (gray cloud)
- Orange cloud will BREAK WebRTC P2P connections
- This is the #1 cause of video call failures

### Production .env Values
You'll need to create these on EC2:
- **JWT_SECRET**: Generate with `openssl rand -base64 32`
- **TURN_PASS**: Create strong password (e.g., `Tr0ub4dor&3xkcd`)
- **ORIGIN**: `https://sidzy.in` (matches domain)

### SSL Certificate
- Free from Let's Encrypt
- Auto-renews every 90 days (certbot handles it)
- Valid for 90 days from issue date
- Green lock icon in browser

### TURN Server
- Runs on same EC2 instance
- Used as fallback when P2P fails (NAT issues)
- Requires same domain as main app

---

## 💡 Architecture Summary

```
Users on Web
     ↓
Browser (https://sidzy.in)
     ↓
nginx (reverse proxy, SSL termination)
     ↓
Node.js Server (localhost:3000)
   ├─ Socket.io Signaling (WebRTC offer/answer/ICE)
   └─ User Authentication (JWT)
     ↓
WebRTC P2P (between users)
   ├─ Primary: Direct P2P (sub-100ms)
   └─ Fallback: TURN relay (when NAT blocks P2P)

coturn (TURN server on port 3478, 5349)
```

---

## 🎯 Success Criteria

After deployment is complete, you should:
- ✅ Visit https://sidzy.in → See login page with green lock
- ✅ Login with sandesh/san22 → See call interface
- ✅ Open 2nd browser, login as sonali/son27 → See video from each other
- ✅ Test screen share → Both see screen in main area
- ✅ Test 4-5 hour call → No disconnects, proper cleanup
- ✅ Check logs → No critical errors, proper Socket.io heartbeat

---

## 📞 Support

If deployment fails:
1. **Check logs**: `sudo journalctl -u 3sync -f` (on EC2)
2. **Check DNS**: `nslookup sidzy.in` (should return EC2 IP)
3. **Check services**: `sudo systemctl status 3sync nginx coturn`
4. **Read**: DEPLOYMENT.md → Troubleshooting section

---

## Files Directory Structure

```
deployment/
├── QUICK_START.md              ← Start here (5 min read)
├── CHECKLIST.md                ← Follow this step-by-step
├── CLOUDFLARE_DNS.md           ← DNS setup guide
├── DEPLOYMENT.md               ← Full technical guide
├── COPY_PASTE_REFERENCE.md    ← Commands & configs
├── START_HERE.md              ← You are here
├── deploy.sh                   ← Automated script
├── nginx.conf                  ← Nginx config
├── turnserver.conf             ← TURN config
├── 3sync.service              ← Systemd service
└── .env.production.template   ← Env template
```

---

## Next Step

👉 **Open**: `QUICK_START.md` (5 minute overview)

Then:

👉 **Follow**: `CHECKLIST.md` (detailed step-by-step)

---

## You've Got This! 🎉

3Sync is production-ready. Deployment is straightforward:
1. Launch EC2 instance (AWS handles it)
2. Add DNS records (Cloudflare GUI, super easy)
3. Run automated script (we did the hard work for you)
4. Test (just login and call)

See you on the other side! 🚀

**Last updated**: May 9, 2026
**Domain**: sidzy.in
**App Status**: Ready to deploy
