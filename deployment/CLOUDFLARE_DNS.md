# Cloudflare DNS Setup for 3Sync

## Quick Reference: What to Add to Cloudflare for sidzy.in

After launching your EC2 instance and getting its Public IP (e.g., `203.0.113.42`), add these DNS records to Cloudflare:

---

## Record 1: Root Domain (sidzy.in)

```
Type:        A
Name:        sidzy.in
Content:     [Your EC2 Public IP]
TTL:         Auto
Proxy Status: DNS Only ⚠️ CRITICAL
```

**Steps:**
1. Login to Cloudflare → sidzy.in
2. DNS tab
3. Add Record
4. Paste values above
5. **IMPORTANT**: Ensure **Proxy Status is "DNS Only"** (gray cloud, not orange)
6. Save

---

## Record 2: www Subdomain (Optional but Recommended)

```
Type:        A
Name:        www
Content:     [Your EC2 Public IP]
TTL:         Auto
Proxy Status: DNS Only ⚠️ CRITICAL
```

**Steps:**
1. Add Record
2. Paste values above
3. **Set Proxy Status to "DNS Only"** (gray cloud)
4. Save

---

## Why "DNS Only" and Not Cloudflare Proxy?

Cloudflare's orange cloud (proxied) adds a man-in-the-middle that breaks WebRTC's peer discovery:
- **Orange Cloud** ❌: Hides real IP → WebRTC STUN fails → peer-to-peer can't connect
- **Gray Cloud (DNS Only)** ✅: Direct DNS lookup → WebRTC gets real IP → P2P works perfectly

**For WebRTC video calling, you MUST use DNS Only.**

---

## Verification (After Adding DNS)

Wait 5-10 minutes for propagation, then test:

### From your computer:
```bash
nslookup sidzy.in
# Should return your EC2 Public IP
```

### From EC2 instance:
```bash
curl https://sidzy.in
# Should return the login page HTML
```

---

## Your EC2 Public IP

Once you launch the EC2 instance in AWS:
1. Go to EC2 Dashboard
2. Find your "3Sync-Server" instance
3. Look for **Public IPv4 address** (e.g., `203.0.113.42`)
4. Copy this IP and use it in both Cloudflare DNS records above

---

## Summary Checklist

- [ ] EC2 instance launched and running
- [ ] Note down EC2 Public IP address
- [ ] Record 1: Added A record for `sidzy.in` with EC2 IP
- [ ] Record 1: Set Proxy Status to "DNS Only" (gray cloud)
- [ ] Record 2 (optional): Added A record for `www` with EC2 IP
- [ ] Record 2: Set Proxy Status to "DNS Only" (gray cloud)
- [ ] Wait 5-10 minutes for DNS propagation
- [ ] Test: `nslookup sidzy.in` returns your EC2 IP
- [ ] Ready to run deployment script on EC2

---

## If You Made a Mistake

### IP changed but DNS still points to old IP
- Update the A record content to new IP
- Changes take 5-10 minutes to propagate

### Accidentally set to orange cloud (proxied)
1. Click on the A record
2. Click the cloud icon to toggle to gray (DNS Only)
3. Save
4. Wait 5-10 minutes

### Domain not resolving
- Check DNS propagation: https://www.whatsmydns.net/
- Or use: `nslookup sidzy.in @1.1.1.1` (Cloudflare's NS)

---

**Ready?** Once DNS is set and verified, run the deployment script on EC2:
```bash
cd ~/3Sync && bash deployment/deploy.sh
```
