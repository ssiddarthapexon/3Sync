# IMPLEMENT.md
## Video Call App — Critical Implementation Details

> This document covers the exact code patterns that are easy to get wrong. Read this before writing any WebRTC or screen share code.

---

## 1. SERVER.JS — COMPLETE STRUCTURE

```javascript
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.ORIGIN || '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// Parse USERS from env: "alice:pass1,bob:pass2"
const USERS = Object.fromEntries(
  (process.env.USERS || '').split(',').map(entry => entry.trim().split(':'))
);

// In-memory room
const room = []; // [{ socketId, username }]

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── REST ──────────────────────────────────────────────
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || USERS[username] !== password) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({
    success: true,
    token,
    username,
    turnServers: {
      urls: [`turn:${process.env.TURN_HOST}:3478`, `turns:${process.env.TURN_HOST}:5349`],
      username: process.env.TURN_USER,
      credential: process.env.TURN_PASS
    }
  });
});

app.get('/api/health', (_, res) => res.json({ ok: true, users: room.length }));

// ── SOCKET AUTH ───────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No token'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

// ── SOCKET EVENTS ─────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] ${socket.user.username} connected (${socket.id})`);

  socket.on('join-room', () => {
    const user = { socketId: socket.id, username: socket.user.username };

    // Tell the new user about everyone already here
    socket.emit('user-joined', {
      userId: socket.id,
      username: socket.user.username,
      existingUsers: room.map(u => ({ userId: u.socketId, username: u.username })),
      isSelf: true
    });

    // Tell everyone else about the new user
    socket.broadcast.emit('user-joined', {
      userId: socket.id,
      username: socket.user.username,
      existingUsers: [],
      isSelf: false
    });

    room.push(user);
  });

  // Signaling relay (server never inspects payload)
  ['offer', 'answer', 'ice-candidate'].forEach(event => {
    socket.on(event, (data) => {
      io.to(data.to).emit(event, { ...data, from: socket.id });
    });
  });

  // State broadcasts
  ['screen-share-started', 'screen-share-stopped', 'user-media-state'].forEach(event => {
    socket.on(event, (data) => {
      socket.broadcast.emit(event, { ...data, from: socket.id });
    });
  });

  socket.on('disconnect', () => {
    const idx = room.findIndex(u => u.socketId === socket.id);
    if (idx !== -1) room.splice(idx, 1);
    socket.broadcast.emit('user-left', { userId: socket.id });
    console.log(`[-] ${socket.user.username} disconnected`);
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

---

## 2. CLIENT.JS — COMPLETE STRUCTURE

```javascript
// ── STATE ─────────────────────────────────────────────
let localStream = null;
let screenStream = null;
let socket = null;
const peerConnections = new Map(); // socketId → RTCPeerConnection
let cameraOn = true;
let micOn = true;
let isSharing = false;

let iceConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// ── INIT ──────────────────────────────────────────────
async function init() {
  const token = sessionStorage.getItem('token');
  const username = sessionStorage.getItem('username');
  if (!token) { window.location.href = '/'; return; }

  // Add TURN servers from login response (stored at login time)
  const turnServers = JSON.parse(sessionStorage.getItem('turnServers') || 'null');
  if (turnServers) iceConfig.iceServers.push(turnServers);

  // Get local media
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    addVideoTile(null, username, true, localStream); // null = local socket ID
  } catch (err) {
    showError('Camera/mic access denied. Check browser permissions.');
  }

  // Connect socket
  socket = io({ auth: { token } });
  socket.on('connect', () => socket.emit('join-room'));
  socket.on('connect_error', (err) => showError('Connection error: ' + err.message));

  // WebRTC events
  socket.on('user-joined', handleUserJoined);
  socket.on('user-left', handleUserLeft);
  socket.on('offer', handleOffer);
  socket.on('answer', handleAnswer);
  socket.on('ice-candidate', handleIceCandidate);
  socket.on('screen-share-started', ({ from }) => setScreenShareLayout(from, true));
  socket.on('screen-share-stopped', ({ from }) => setScreenShareLayout(from, false));
  socket.on('user-media-state', handleMediaState);
}

document.addEventListener('DOMContentLoaded', init);
```

---

## 3. PEER CONNECTION — CORRECT SETUP

```javascript
function createPeerConnection(peerId, peerUsername) {
  const pc = new RTCPeerConnection(iceConfig);
  peerConnections.set(peerId, pc);

  // Add local tracks
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  // ICE
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      socket.emit('ice-candidate', { to: peerId, candidate });
    }
  };

  // Remote track → display
  pc.ontrack = (event) => {
    let tile = document.getElementById(`tile-${peerId}`);
    if (!tile) tile = addVideoTile(peerId, peerUsername, false);
    const video = tile.querySelector('video');
    if (video.srcObject !== event.streams[0]) {
      video.srcObject = event.streams[0];
    }
  };

  // Connection state
  pc.onconnectionstatechange = () => {
    console.log(`[${peerUsername}] state: ${pc.connectionState}`);
    if (pc.connectionState === 'failed') {
      attemptIceRestart(peerId);
    }
    if (pc.connectionState === 'disconnected') {
      // Wait a bit — might recover
      setTimeout(() => {
        if (pc.connectionState !== 'connected') handleUserLeft({ userId: peerId });
      }, 5000);
    }
  };

  return pc;
}
```

---

## 4. OFFER/ANSWER FLOW — EXACT SEQUENCE

### When a new user joins (you initiate):
```javascript
async function handleUserJoined({ userId, username, existingUsers, isSelf }) {
  if (isSelf) {
    // Create connections to everyone already in the room
    for (const user of existingUsers) {
      const pc = createPeerConnection(user.userId, user.username);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', { to: user.userId, sdp: offer });
    }
  } else {
    // Someone else joined — create connection, wait for their offer
    createPeerConnection(userId, username);
  }
}
```

### Receiving an offer:
```javascript
async function handleOffer({ from, sdp, fromUsername }) {
  let pc = peerConnections.get(from);
  if (!pc) pc = createPeerConnection(from, fromUsername || from);

  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('answer', { to: from, sdp: answer });
}
```

### Receiving an answer:
```javascript
async function handleAnswer({ from, sdp }) {
  const pc = peerConnections.get(from);
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
}
```

### ICE candidate:
```javascript
async function handleIceCandidate({ from, candidate }) {
  const pc = peerConnections.get(from);
  if (pc && candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('ICE candidate error:', e);
    }
  }
}
```

---

## 5. SCREEN SHARE — EXACT IMPLEMENTATION

```javascript
async function startScreenShare() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'window',
        frameRate: { ideal: 60, max: 60 },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        cursor: 'always'
      },
      audio: false,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'exclude',
      preferCurrentTab: false
    });

    const screenTrack = screenStream.getVideoTracks()[0];
    screenTrack.contentHint = 'detail';

    // Replace in all peer connections
    for (const [, pc] of peerConnections) {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (!sender) continue;

      await sender.replaceTrack(screenTrack);

      // Boost bitrate
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = 50_000_000; // 50 Mbps
      params.encodings[0].maxFramerate = 60;
      params.encodings[0].priority = 'high';
      params.encodings[0].networkPriority = 'high';
      try { await sender.setParameters(params); } catch (e) {
        console.warn('setParameters failed (expected in some browsers):', e);
      }
    }

    // Show local screen preview in local tile
    const localVideo = document.querySelector('#tile-local video');
    if (localVideo) localVideo.srcObject = screenStream;

    // When user stops sharing via browser UI (clicking the stop button in browser chrome)
    screenTrack.addEventListener('ended', stopScreenShare);

    isSharing = true;
    updateShareButton(true);
    socket.emit('screen-share-started', {});

  } catch (err) {
    if (err.name === 'NotAllowedError') return; // user cancelled picker
    console.error('Screen share error:', err);
  }
}

async function stopScreenShare() {
  if (!isSharing) return;
  isSharing = false;

  const cameraTrack = localStream.getVideoTracks()[0];

  for (const [, pc] of peerConnections) {
    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
    if (!sender) continue;

    await sender.replaceTrack(cameraTrack);

    // Reset to camera bitrate
    const params = sender.getParameters();
    if (params.encodings?.length) {
      params.encodings[0].maxBitrate = 2_500_000; // 2.5 Mbps for camera
      params.encodings[0].maxFramerate = 30;
      params.encodings[0].priority = 'medium';
      delete params.encodings[0].networkPriority;
      try { await sender.setParameters(params); } catch {}
    }
  }

  // Restore local video to camera
  const localVideo = document.querySelector('#tile-local video');
  if (localVideo) localVideo.srcObject = localStream;

  // Stop screen tracks
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }

  updateShareButton(false);
  socket.emit('screen-share-stopped', {});
}
```

---

## 6. SDP PATCHING (Apply if replaceTrack alone is insufficient)

```javascript
function patchSDPForScreenShare(sdp) {
  // Remove existing bandwidth constraints
  let patched = sdp.replace(/b=AS:[0-9]+\r\n/g, '');
  patched = patched.replace(/b=TIAS:[0-9]+\r\n/g, '');

  // Inject high-bandwidth lines after the video m-line
  patched = patched.replace(
    /(m=video.*\r\n)/,
    '$1b=AS:50000\r\nb=TIAS:50000000\r\n'
  );

  return patched;
}

// Usage in createOffer:
const offer = await pc.createOffer();
const patchedSdp = isSharing ? patchSDPForScreenShare(offer.sdp) : offer.sdp;
const patchedOffer = new RTCSessionDescription({ type: offer.type, sdp: patchedSdp });
await pc.setLocalDescription(patchedOffer);
socket.emit('offer', { to: peerId, sdp: patchedOffer });
```

---

## 7. VIDEO TILE MANAGEMENT

```javascript
function addVideoTile(socketId, username, isLocal, stream = null) {
  const tileId = isLocal ? 'tile-local' : `tile-${socketId}`;
  if (document.getElementById(tileId)) return document.getElementById(tileId);

  const tile = document.createElement('div');
  tile.className = 'video-tile';
  tile.id = tileId;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = isLocal; // IMPORTANT: mute local to prevent echo
  if (isLocal) video.style.transform = 'scaleX(-1)'; // mirror
  if (stream) video.srcObject = stream;

  const label = document.createElement('div');
  label.className = 'name-label';
  label.textContent = username + (isLocal ? ' (You)' : '');

  tile.append(video, label);
  document.getElementById('video-grid').appendChild(tile);
  return tile;
}

function removeVideoTile(socketId) {
  const tile = document.getElementById(`tile-${socketId}`);
  if (tile) {
    tile.style.opacity = '0';
    tile.style.transition = 'opacity 0.3s';
    setTimeout(() => tile.remove(), 300);
  }
}
```

---

## 8. SCREEN SHARE LAYOUT (CSS CLASS APPROACH)

```css
/* Normal grid */
#video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 8px;
}

/* Screen share active — large main + sidebar */
#video-grid.screen-sharing {
  grid-template-columns: 1fr 200px;
  grid-template-rows: 1fr;
}

#video-grid.screen-sharing .screen-share-tile {
  grid-column: 1;
  grid-row: 1;
}

#video-grid.screen-sharing .video-tile:not(.screen-share-tile) {
  /* sidebar tiles */
}
```

```javascript
function setScreenShareLayout(fromId, active) {
  const grid = document.getElementById('video-grid');
  const tile = document.getElementById(`tile-${fromId}`);
  if (active) {
    grid.classList.add('screen-sharing');
    tile?.classList.add('screen-share-tile');
  } else {
    grid.classList.remove('screen-sharing');
    tile?.classList.remove('screen-share-tile');
  }
}
```

---

## 9. LOGIN PAGE — STORE TURN SERVERS

```javascript
// In index.html script, after successful login:
const data = await response.json();
sessionStorage.setItem('token', data.token);
sessionStorage.setItem('username', data.username);
sessionStorage.setItem('turnServers', JSON.stringify(data.turnServers));
window.location.href = '/call';
```

---

## 10. COMMON MISTAKES TO AVOID

| Mistake | Correct Approach |
|---|---|
| `video.muted = false` on local video | Always mute local video to prevent echo |
| Not setting `playsInline` | Always set `playsInline = true` on video elements |
| Calling `setLocalDescription` before `getVideoTracks` has resolved | Always `await` getUserMedia before creating connections |
| Adding ICE candidates before remote description is set | Queue ICE candidates until `setRemoteDescription` is called |
| Not catching `replaceTrack` rejection | Always try/catch around `replaceTrack` |
| Setting `srcObject` every time `ontrack` fires | Check if `srcObject` already equals `event.streams[0]` |
| Keeping screen share stream alive after stop | Call `.stop()` on all tracks in screenStream |
| Using `localStorage` for token | Use `sessionStorage` — clears on tab close |
| Hardcoding TURN credentials in client JS | Get them from the server's login response |
