# PLAN.md
## Video Call App — Architecture & Approach Plan

---

## PHASE OVERVIEW

```
Phase 1: Foundation       (~1 day)   Server + Auth
Phase 2: Basic Video Call (~1 day)   WebRTC + Grid UI
Phase 3: Screen Share     (~1 day)   The Core Feature
Phase 4: Polish           (~0.5 day) Controls, States, Edge Cases
Phase 5: Deployment       (~0.5 day) EC2 + coturn + nginx + SSL
```

---

## PHASE 1 — FOUNDATION

### Goal
Running server that authenticates hardcoded users and serves the frontend.

### What to build

**`server.js` (complete skeleton)**
- Express static file serving from `/public`
- `POST /login` endpoint that reads `USERS` from `.env`, verifies password, returns JWT
- Socket.io server setup with JWT auth middleware on handshake
- In-memory room object `rooms["main"]`
- Socket events: `join-room`, `disconnect`
- `GET /api/health`

**`.env` + `.env.example`**
- `USERS`, `JWT_SECRET`, `PORT`, `TURN_HOST`, `TURN_USER`, `TURN_PASS`

**`public/index.html`** (Login page)
- Clean form: username, password, "Join Call" button
- On submit: `POST /login`, store token in `sessionStorage`, redirect to `/call`
- Inline error message on failure
- No loading spinners needed — it's instant

**`public/style.css`** (Base styles)
- Dark background (`#0a0a0a`)
- Clean sans-serif font (system font stack)
- Button styles for the 4 controls

### Success criteria
- `alice:pass123` logs in → redirects to `/call`
- `alice:wrongpass` shows error
- Token stored in sessionStorage
- Bad token → Socket.io connection rejected

---

## PHASE 2 — BASIC VIDEO CALL

### Goal
Two users can open the app in separate tabs/browsers and see+hear each other.

### What to build

**`public/call.html`**
- Video grid container (CSS Grid)
- Control bar at bottom
- No complexity — just the tiles and buttons

**`public/client.js` — Core WebRTC logic**

```
On load:
  1. Check sessionStorage for token
  2. Connect Socket.io (token in auth)
  3. getUserMedia({ video: 720p, audio: true })
  4. Show local video tile
  5. Emit join-room "main"

On user-joined event (someone else joined):
  1. Create RTCPeerConnection with ICE config
  2. Add local tracks
  3. Create offer
  4. Set local description
  5. Send offer via socket

On offer received:
  1. Create RTCPeerConnection
  2. Add local tracks
  3. Set remote description
  4. Create answer
  5. Send answer

On answer received:
  1. Set remote description

On ICE candidate received:
  1. Add ICE candidate

On track received:
  1. Create video tile for that peer
  2. Set srcObject to remote stream

On user-left:
  1. Close peer connection
  2. Remove video tile
```

**`server.js` — Add signaling**
- `offer` event: forward to target socket ID
- `answer` event: forward to target socket ID
- `ice-candidate` event: forward to target socket ID
- `user-joined`: broadcast to room with existing user list
- `user-left`: broadcast to room

### Success criteria
- Alice and Bob see each other's video and hear each other
- Alice leaves → Bob's tile disappears
- Bob refreshes → Alice sees the new tile

---

## PHASE 3 — SCREEN SHARE (THE CORE FEATURE)

### Goal
Any user can share an application window at full quality. All others see it in near real-time with no lag. This must look like watching a local file.

### What to build

**Screen share button handler (`client.js`)**

```
On "Share" click:
  1. getDisplayMedia({ displaySurface: "window", 60fps, 1920x1080 })
  2. Set contentHint = "detail" on video track
  3. Replace video track in ALL peer connections (replaceTrack)
  4. Modify SDP to inject b=AS:50000 + b=TIAS:50000000 (if renegotiation needed)
  5. Set RTCRtpSender params: maxBitrate=50Mbps, priority=high
  6. Emit "screen-share-started" to server
  7. Update Share button state → "Stop Sharing"

On stream.getVideoTracks()[0] "ended" event:
  1. Revert to camera track in all peer connections
  2. Emit "screen-share-stopped"
  3. Reset Share button

On "screen-share-started" received from a peer:
  1. Expand that peer's video tile to large view
  2. Move camera tiles to sidebar

On "screen-share-stopped" received from a peer:
  1. Revert grid layout
```

**SDP injection (critical)**

The `createOffer` / `createAnswer` flow must patch the SDP before `setLocalDescription`. Write a `patchSDP(sdp, isScreenShare)` function that:
- Removes any `b=AS:` or `b=TIAS:` lines
- Inserts `b=AS:50000` and `b=TIAS:50000000` after the `m=video` line

**Track replacement vs renegotiation decision:**
- Use `replaceTrack()` — no renegotiation needed for same codec
- Only renegotiate if the codec changes (VP8→VP9 switch) — try to avoid this

**VP9 preference:**
- On `createOffer`, reorder SDP codecs to prefer VP9 over VP8 for video tracks

### Success criteria
- Alice shares VLC window
- Bob sees the video within 500ms of picker close
- Video plays at 30–60fps with no stutter
- Alice closes picker → reverts to camera within 1 second
- Layout shifts correctly when share starts/stops

---

## PHASE 4 — POLISH & EDGE CASES

### Camera Toggle
```javascript
localStream.getVideoTracks()[0].enabled = !currentState;
// Also send user-media-state event
```

### Mic Toggle
```javascript
localStream.getAudioTracks()[0].enabled = !currentState;
// Also send user-media-state event
```

### Muted indicator on peers
- When `user-media-state` received → update that peer's tile with mic-off icon

### Leave button
```javascript
// Close all peer connections
// Stop all local tracks
// Disconnect socket
// Clear sessionStorage token
// window.location = "/"
```

### Reconnection handling
- Socket.io auto-reconnect: enabled, exponential backoff
- On reconnect: re-emit `join-room`, recreate peer connections

### Peer disconnect
- Close `RTCPeerConnection` for that socket ID
- Remove tile from grid
- Smooth CSS transition for grid reflow

### Error states
- Camera/mic denied → banner: "Camera/mic access denied. Check browser permissions."
- Screen share denied/cancelled → do nothing (user cancelled picker)
- Join page with no token → redirect to login immediately

---

## PHASE 5 — DEPLOYMENT

### EC2 Setup

**Instance:** t3.small (2 vCPU, 2GB RAM) — Ubuntu 22.04 LTS

**Ports to open in Security Group:**
- 22 (SSH)
- 80 (HTTP → nginx redirects to HTTPS)
- 443 (HTTPS)
- 3478/UDP (TURN)
- 3478/TCP (TURN)
- 5349/TCP (TURNS over TLS)
- 49152–65535/UDP (TURN relay range)

**Steps:**
1. SSH in, install Node.js 20 LTS via nvm
2. Clone repo, `npm install --production`
3. Create `.env` with production values
4. Install nginx, configure reverse proxy (see `nginx.conf`)
5. Install certbot, get Let's Encrypt cert for your domain
6. Install coturn, configure with `.env` TURN credentials
7. Set up systemd services for Node.js app
8. `sudo systemctl enable --now` for node-app, nginx, coturn
9. Test with 2 browsers from different networks

### coturn Configuration

```
# /etc/turnserver.conf
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
user=turnuser:turnpassword
realm=your-domain.com
cert=/etc/letsencrypt/live/your-domain.com/fullchain.pem
pkey=/etc/letsencrypt/live/your-domain.com/privkey.pem
log-file=/var/log/turnserver/turnserver.log
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
min-port=49152
max-port=65535
```

### nginx Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Systemd Service

```ini
[Unit]
Description=Video Call App
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/video-call-app
EnvironmentFile=/home/ubuntu/video-call-app/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

---

## ARCHITECTURE DECISION LOG

| Decision | Choice | Why |
|---|---|---|
| Auth | Hardcoded users in `.env` | No DB, no complexity, private app |
| Topology | Full mesh P2P | Best for ≤8 users, no media server cost |
| Screen share codec | VP9 preferred | Better compression at 1080p |
| SDP bitrate | Inject 50Mbps cap | Uncap for highest quality |
| Track switch | replaceTrack() | No renegotiation, instant switch |
| Frontend framework | Vanilla JS | Zero build step, fastest iteration |
| Room management | Single room "main" | Fits the use case exactly |
| Token storage | sessionStorage | Clears on tab close, simpler |
