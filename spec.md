# SPEC.md
## Video Call App — Functional & Technical Specification

---

## 1. OVERVIEW

A private, invite-only, browser-based video calling app for 2–8 people. The primary use case is **high-fidelity screen sharing** (e.g., watching a 1080p movie together with zero lag). Built on WebRTC P2P + Node.js signaling server.

---

## 2. USER ROSTER (HARDCODED)

Users are defined server-side in a `.env` file. Example:

```
USERS=alice:pass123,bob:pass456,charlie:pass789
```

The server parses this into a map at startup:
```javascript
const USERS = {
  alice: "pass123",
  bob: "pass456",
  charlie: "pass789"
}
```

- Max 8 users in the roster
- No self-service registration
- Admin (you) adds/removes users by editing `.env` and restarting the server

---

## 3. AUTHENTICATION FLOW

### 3.1 Login Page (`/` → `index.html`)

**Fields:**
- Username (text input)
- Password (password input)
- "Join Call" button

**Behavior:**
1. User submits form → `POST /login` with `{ username, password }`
2. Server checks against hardcoded `USERS` map
3. On match → returns `{ token, username }`
4. Client stores token in `sessionStorage` (not localStorage — clears on tab close)
5. Client redirects to `/call`
6. On failure → show inline error: `"Invalid username or password"`

**No:** "Create account", "Forgot password", "Remember me"

### 3.2 JWT Token

```javascript
jwt.sign(
  { username, iat: Date.now() },
  JWT_SECRET,
  { expiresIn: "24h" }
)
```

- Every Socket.io connection must send this token in the handshake auth header
- Server verifies on every connection attempt

---

## 4. CALL PAGE (`/call` → `call.html`)

### 4.1 Auto-Join

On page load:
1. Read token from `sessionStorage`
2. If missing → redirect to `/`
3. Open Socket.io connection with token in auth header
4. Emit `join-room` with room ID `"main"`
5. Start camera + mic acquisition immediately

### 4.2 Video Grid Layout

- CSS Grid, auto-fit columns, square-ish tiles
- Each tile: participant's video + name label overlay (bottom-left)
- Local video: mirrored (`transform: scaleX(-1)`)
- Screen share active: screen share tile expands to ~70% of viewport; camera tiles shrink to sidebar row
- Max tiles: 8

### 4.3 Control Bar (always visible, bottom center)

```
[ 📷 Camera ]  [ 🎤 Mic ]  [ 🖥 Share ]  [ 📴 Leave ]
```

- Camera button: green when on, red/strikethrough when off
- Mic button: green when on, red/strikethrough when off
- Share button: blue when idle, pulsing orange/red when sharing
- Leave button: always red

### 4.4 Participant Name Display

- Name shown on each tile as an overlay
- If mic is muted, show a muted icon next to the name

---

## 5. SCREEN SHARING SPECIFICATION

This is the most critical feature. The following must be implemented exactly.

### 5.1 Requesting the Stream

```javascript
const screenStream = await navigator.mediaDevices.getDisplayMedia({
  video: {
    displaySurface: "window",
    frameRate: { ideal: 60, max: 60 },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    cursor: "always"
  },
  audio: false,
  selfBrowserSurface: "exclude",
  surfaceSwitching: "exclude",
  preferCurrentTab: false
});
```

### 5.2 SDP Bandwidth Modification (CRITICAL FOR SPEED)

After creating the SDP offer/answer, the app MUST inject bandwidth directives to uncap the screen share track:

```javascript
function forceHighBitrateScreenShare(sdp) {
  // Remove existing bandwidth lines
  sdp = sdp.replace(/b=AS:.*\r\n/g, '');
  sdp = sdp.replace(/b=TIAS:.*\r\n/g, '');
  // Insert high-bandwidth directives after video m-line
  sdp = sdp.replace(
    /m=video.*\r\n/g,
    (match) => match + 'b=AS:50000\r\nb=TIAS:50000000\r\n'
  );
  return sdp;
}
```

50 Mbps cap is effectively uncapped for most home connections. Adjust down if needed.

### 5.3 RTCRtpSender Parameters (post-connection)

After the peer connection is established, set sender parameters:

```javascript
const videoSender = peerConnection.getSenders()
  .find(s => s.track?.kind === 'video');

if (videoSender) {
  const params = videoSender.getParameters();
  if (!params.encodings) params.encodings = [{}];
  params.encodings[0].maxBitrate = 50_000_000; // 50 Mbps
  params.encodings[0].maxFramerate = 60;
  params.encodings[0].priority = 'high';
  params.encodings[0].networkPriority = 'high';
  await videoSender.setParameters(params);
}
```

### 5.4 Content Hint

```javascript
const screenTrack = screenStream.getVideoTracks()[0];
screenTrack.contentHint = "detail"; // NOT "motion" — tells browser to prioritize sharpness
```

### 5.5 Track Replacement (No Renegotiation Needed)

When screen share starts, **replace** the camera track in all existing peer connections:

```javascript
for (const [peerId, pc] of peerConnections) {
  const sender = pc.getSenders().find(s => s.track?.kind === 'video');
  if (sender) await sender.replaceTrack(screenTrack);
}
```

When screen share stops, replace back with camera track.

### 5.6 Screen Share End Detection

```javascript
screenTrack.addEventListener('ended', () => {
  stopScreenShare(); // revert to camera
});
```

---

## 6. WEBRTC ARCHITECTURE

### 6.1 Topology

**Full mesh P2P** — every participant connects to every other participant directly.

For N participants: N×(N-1)/2 peer connections total.
- 2 users: 1 connection
- 4 users: 6 connections
- 8 users: 28 connections

Acceptable for 8 users on modern hardware.

### 6.2 ICE Configuration

```javascript
const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: `turn:${TURN_HOST}:3478`,
      username: TURN_USER,
      credential: TURN_PASS
    },
    {
      urls: `turns:${TURN_HOST}:443`,  // TURN over TLS (firewall bypass)
      username: TURN_USER,
      credential: TURN_PASS
    }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",      // reduces port usage
  rtcpMuxPolicy: "require"         // reduces port usage
};
```

### 6.3 Preferred Codec

Prefer VP9 for screen share (better compression at high resolution):

```javascript
function preferVP9(sdp) {
  // Re-order VP9 before VP8 in the video m-line
  const vp9Line = sdp.match(/a=rtpmap:\d+ VP9\/90000\r\n/);
  // ... reorder codec priority
}
```

### 6.4 Signaling Events (Socket.io)

| Event | Direction | Payload |
|---|---|---|
| `join-room` | Client → Server | `{ roomId, username }` |
| `user-joined` | Server → All | `{ userId, username, existingUsers[] }` |
| `user-left` | Server → All | `{ userId }` |
| `offer` | Client → Server → Peer | `{ to, from, sdp }` |
| `answer` | Client → Server → Peer | `{ to, from, sdp }` |
| `ice-candidate` | Client → Server → Peer | `{ to, from, candidate }` |
| `screen-share-started` | Client → Server → All | `{ from }` |
| `screen-share-stopped` | Client → Server → All | `{ from }` |
| `user-media-state` | Client → Server → All | `{ from, camera, mic }` |

---

## 7. BACKEND SPECIFICATION

### 7.1 REST Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/login` | None | Verify credentials, return JWT |
| GET | `/api/health` | None | Server health check |

### 7.2 In-Memory State

```javascript
const rooms = {
  "main": {
    users: [
      { socketId, username, joinedAt }
    ]
  }
};
```

### 7.3 Hardcoded Users Format (`.env`)

```
USERS=alice:secret1,bob:secret2,charlie:secret3
JWT_SECRET=your-long-random-string-here
TURN_HOST=your-domain.com
TURN_USER=turnuser
TURN_PASS=turnpassword
PORT=3000
```

---

## 8. PERFORMANCE TARGETS

| Metric | Target |
|---|---|
| Screen share latency | < 80ms |
| Screen share frame rate | 30–60 fps |
| Screen share bitrate (peak) | Up to 30–50 Mbps P2P |
| Audio latency | < 50ms |
| Camera video | 720p @ 30fps |
| Time to first frame (screen share) | < 500ms after picker confirm |
| Memory (browser tab) | < 400MB with 4 participants |
| Server CPU at 8 users | < 10% (signaling only) |

---

## 9. BROWSER SUPPORT

| Browser | Support |
|---|---|
| Chrome 100+ | ✅ Full |
| Edge 100+ | ✅ Full |
| Firefox 100+ | ✅ Full (window share may behave differently) |
| Safari 15.4+ | ⚠️ Partial (no `displaySurface` hint support) |

Primary target: **Chrome on desktop** (best WebRTC + screen share support).

---

## 10. FILE STRUCTURE

```
video-call-app/
├── .env                    # Credentials (never committed)
├── .env.example            # Template
├── .gitignore
├── package.json
├── server.js               # Entire backend (single file)
├── public/
│   ├── index.html          # Login page
│   ├── call.html           # Call page
│   ├── style.css           # All styles
│   └── client.js           # All WebRTC + Socket.io logic
└── nginx.conf              # Reverse proxy config
```

No `src/`, no `dist/`, no build step.
