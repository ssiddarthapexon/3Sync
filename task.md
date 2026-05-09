# TASK.md
## Video Call App — Granular Task List

> Work through these tasks in order. Do not skip ahead. Each task builds on the previous one. Mark tasks complete as you go.

---

## STAGE 1: PROJECT SCAFFOLDING

- [ ] **T01** — Create the folder structure:
  ```
  video-call-app/
  ├── public/
  │   ├── index.html
  │   ├── call.html
  │   ├── style.css
  │   └── client.js
  ├── server.js
  ├── package.json
  ├── .env
  ├── .env.example
  └── .gitignore
  ```

- [ ] **T02** — Create `package.json` with dependencies:
  - `express`, `socket.io`, `jsonwebtoken`, `cors`, `dotenv`
  - devDependency: `nodemon`
  - scripts: `start: node server.js`, `dev: nodemon server.js`

- [ ] **T03** — Create `.env.example`:
  ```
  USERS=alice:pass1,bob:pass2,charlie:pass3
  JWT_SECRET=change-this-to-a-long-random-string
  PORT=3000
  TURN_HOST=your-domain.com
  TURN_USER=turnuser
  TURN_PASS=turnpassword
  ```

- [ ] **T04** — Create `.env` (local dev, fill in real test passwords)

- [ ] **T05** — Create `.gitignore` (exclude `.env`, `node_modules/`)

- [ ] **T06** — Run `npm install`

---

## STAGE 2: BACKEND — AUTH & SIGNALING SERVER

- [ ] **T07** — In `server.js`, load and parse `USERS` from `.env`:
  ```javascript
  const USERS = Object.fromEntries(
    process.env.USERS.split(',').map(u => u.split(':'))
  );
  ```

- [ ] **T08** — Set up Express with `cors`, `express.json()`, and static serving from `./public`

- [ ] **T09** — Implement `POST /login`:
  - Accept `{ username, password }`
  - Check against `USERS` map
  - On match: return `{ success: true, token, username }`
  - On fail: return `{ success: false, error: "Invalid credentials" }` with status 401
  - JWT payload: `{ username }`, expires `24h`

- [ ] **T10** — Implement `GET /api/health` returning `{ ok: true, users: count }`

- [ ] **T11** — Set up Socket.io with JWT auth middleware:
  ```javascript
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    try {
      socket.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });
  ```

- [ ] **T12** — Implement in-memory room state:
  ```javascript
  const rooms = { main: [] }; // array of { socketId, username }
  ```

- [ ] **T13** — Implement `join-room` socket event:
  - Add user to `rooms["main"]`
  - Emit `user-joined` to the new user with the existing user list
  - Broadcast `user-joined` to all others in the room

- [ ] **T14** — Implement `disconnect` socket event:
  - Remove user from `rooms["main"]`
  - Broadcast `user-left` with their socket ID to the room

- [ ] **T15** — Implement signaling relay events (server just forwards):
  - `offer` → forward to `data.to`
  - `answer` → forward to `data.to`
  - `ice-candidate` → forward to `data.to`

- [ ] **T16** — Implement state broadcast relay events:
  - `screen-share-started` → broadcast to room (excluding sender)
  - `screen-share-stopped` → broadcast to room (excluding sender)
  - `user-media-state` → broadcast to room (excluding sender)

- [ ] **T17** — Start server, verify `GET /api/health` returns 200

---

## STAGE 3: FRONTEND — LOGIN PAGE

- [ ] **T18** — Build `public/index.html`:
  - Dark background, centered card
  - App name/logo at top
  - Username input (type="text", autocomplete="username")
  - Password input (type="password", autocomplete="current-password")
  - "Join Call" button
  - Error message div (hidden by default)
  - No sign-up link, no forgot password link

- [ ] **T19** — In `public/index.html` inline script (or separate login.js):
  - On form submit: prevent default
  - `POST /login` with fetch
  - On success: store token in `sessionStorage`, redirect to `/call`
  - On failure: show error message div with error text
  - Show loading state on button while fetching

- [ ] **T20** — Style the login page in `style.css`:
  - Dark theme: `#0a0a0a` background, `#1a1a1a` card
  - White text, subtle border on card
  - Input fields: dark fill, white text, focus ring
  - Button: blue (`#2563eb`), hover state
  - Error: red text

- [ ] **T21** — Test login: correct creds → redirect, wrong creds → error shown

---

## STAGE 4: FRONTEND — CALL PAGE STRUCTURE

- [ ] **T22** — Build `public/call.html`:
  - Body with `#video-grid` container (CSS Grid)
  - Control bar `#controls` fixed at bottom center
  - Four buttons: `#btn-camera`, `#btn-mic`, `#btn-share`, `#btn-leave`
  - No other UI elements

- [ ] **T23** — Style `#video-grid` in `style.css`:
  - `display: grid`
  - `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))`
  - `gap: 8px`
  - Full viewport height minus control bar
  - Each `.video-tile`: relative position, black background, border-radius

- [ ] **T24** — Style `.video-tile video` element:
  - `width: 100%, height: 100%, object-fit: cover`
  - Local video: `transform: scaleX(-1)` (mirror)

- [ ] **T25** — Style `.video-tile .name-label`:
  - Absolute bottom-left of tile
  - Semi-transparent dark background
  - White text, small font

- [ ] **T26** — Style `#controls`:
  - Fixed bottom center
  - Flexbox, gap between buttons
  - Dark semi-transparent background, padding, border-radius

- [ ] **T27** — Style the 4 control buttons:
  - Camera: green when on, `#ef4444` red + strikethrough icon when off
  - Mic: same color logic as camera
  - Share: `#2563eb` blue when idle, `#f97316` orange + pulse animation when active
  - Leave: always `#dc2626` red

---

## STAGE 5: WEBRTC — LOCAL MEDIA

- [ ] **T28** — In `public/client.js`, on page load:
  - Check `sessionStorage.getItem('token')` — if null, redirect to `/`
  - Store `username` from sessionStorage

- [ ] **T29** — Request local media:
  ```javascript
  const localStream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  ```

- [ ] **T30** — Create local video tile and add to grid:
  - `createVideoTile(socketId, username, isLocal)` function
  - Append to `#video-grid`
  - Set `video.srcObject = localStream`

- [ ] **T31** — Connect Socket.io with token:
  ```javascript
  const socket = io({ auth: { token } });
  ```

- [ ] **T32** — On `connect`, emit `join-room` with room ID `"main"` and `username`

---

## STAGE 6: WEBRTC — PEER CONNECTIONS

- [ ] **T33** — Define ICE config:
  ```javascript
  const ICE_CONFIG = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
      // TURN added in production via server response
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require"
  };
  ```

- [ ] **T34** — `createPeerConnection(peerId, peerUsername)` function:
  - Creates `RTCPeerConnection`
  - Adds all local tracks from `localStream`
  - Sets up `onicecandidate` → emit to server
  - Sets up `ontrack` → create/update remote video tile
  - Sets up `onconnectionstatechange` → log state
  - Stores in `peerConnections` Map

- [ ] **T35** — Handle `user-joined` event (someone else joined the room):
  - If the event contains `existingUsers`, this is the initial join response
  - For each existing user: `createPeerConnection`, then `createOffer`
  - If it's a new user joining: `createPeerConnection` (wait for their offer)

- [ ] **T36** — `createOffer` flow:
  ```javascript
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('offer', { to: peerId, from: socket.id, sdp: offer });
  ```

- [ ] **T37** — Handle `offer` received:
  - `createPeerConnection` for that peer
  - `setRemoteDescription(offer)`
  - `createAnswer`
  - `setLocalDescription(answer)`
  - Emit `answer`

- [ ] **T38** — Handle `answer` received:
  - `peerConnections.get(from).setRemoteDescription(answer)`

- [ ] **T39** — Handle `ice-candidate` received:
  - `peerConnections.get(from).addIceCandidate(candidate)`

- [ ] **T40** — Handle `user-left`:
  - `peerConnections.get(userId).close()`
  - Remove tile from grid
  - Delete from `peerConnections` map

- [ ] **T41** — Test: Alice and Bob can see and hear each other

---

## STAGE 7: CONTROLS

- [ ] **T42** — Camera toggle (`#btn-camera`):
  ```javascript
  localStream.getVideoTracks()[0].enabled = !cameraOn;
  cameraOn = !cameraOn;
  // update button appearance
  socket.emit('user-media-state', { camera: cameraOn, mic: micOn });
  ```

- [ ] **T43** — Mic toggle (`#btn-mic`):
  - Same pattern as camera with audio track

- [ ] **T44** — Leave button (`#btn-leave`):
  - Close all peer connections
  - Stop all local stream tracks
  - Disconnect socket
  - Clear `sessionStorage`
  - `window.location = "/"`

- [ ] **T45** — Handle `user-media-state` from peers:
  - Update that peer's tile with mic-off icon overlay if `mic === false`

---

## STAGE 8: SCREEN SHARE (CRITICAL)

- [ ] **T46** — `startScreenShare()` function:
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

- [ ] **T47** — Set `contentHint = "detail"` on the screen video track

- [ ] **T48** — Replace video track in ALL peer connections:
  ```javascript
  const screenTrack = screenStream.getVideoTracks()[0];
  for (const [peerId, pc] of peerConnections) {
    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
    if (sender) await sender.replaceTrack(screenTrack);
  }
  ```

- [ ] **T49** — After track replacement, boost bitrate on each sender:
  ```javascript
  const params = sender.getParameters();
  if (!params.encodings?.length) params.encodings = [{}];
  params.encodings[0].maxBitrate = 50_000_000;
  params.encodings[0].maxFramerate = 60;
  params.encodings[0].priority = 'high';
  params.encodings[0].networkPriority = 'high';
  await sender.setParameters(params);
  ```

- [ ] **T50** — Implement `patchSDP(sdp)` function:
  - Strip existing `b=AS:` and `b=TIAS:` lines from video section
  - Insert `b=AS:50000\r\nb=TIAS:50000000\r\n` after `m=video` line
  - Apply this during `createOffer` / `createAnswer` when screen sharing is active

- [ ] **T51** — Listen for `screenTrack.addEventListener('ended', stopScreenShare)`

- [ ] **T52** — `stopScreenShare()` function:
  - Replace screen track back with camera track in all peer connections
  - Reset sender bitrate params to camera defaults
  - Emit `screen-share-stopped`
  - Update Share button state

- [ ] **T53** — Emit `screen-share-started` to server when share begins

- [ ] **T54** — Handle `screen-share-started` from peers:
  - Expand that peer's tile to large (CSS class change)
  - Move other tiles to sidebar layout

- [ ] **T55** — Handle `screen-share-stopped` from peers:
  - Revert to normal grid layout

- [ ] **T56** — Test: Share VLC window → remote peer sees it immediately, plays smoothly

---

## STAGE 9: EDGE CASES & HARDENING

- [ ] **T57** — Handle getUserMedia failure (camera denied):
  - Show error banner on call page
  - Still allow joining with no video

- [ ] **T58** — Handle getDisplayMedia cancellation (user closes picker without selecting):
  - Catch the rejection silently, do nothing

- [ ] **T59** — Handle peer connection failure:
  - On `connectionState === "failed"`: attempt ICE restart
  - If restart fails: close connection, remove tile

- [ ] **T60** — ICE restart logic:
  ```javascript
  const offer = await pc.createOffer({ iceRestart: true });
  await pc.setLocalDescription(offer);
  socket.emit('offer', { to: peerId, from: socket.id, sdp: offer, isRestart: true });
  ```

- [ ] **T61** — Socket.io reconnection:
  - On `reconnect` event: re-emit `join-room`
  - On `connect_error`: show "Reconnecting..." overlay

---

## STAGE 10: DEPLOYMENT

- [ ] **T62** — Create `nginx.conf` (see plan.md Phase 5)

- [ ] **T63** — Create `systemd-service.conf` (see plan.md Phase 5)

- [ ] **T64** — Create `coturn.conf` (see plan.md Phase 5)

- [ ] **T65** — SSH into EC2, install Node.js 20 via nvm

- [ ] **T66** — Transfer files, `npm install --production`

- [ ] **T67** — Create `.env` on server with production values

- [ ] **T68** — Install and configure nginx, get SSL cert via certbot

- [ ] **T69** — Install coturn, configure with SSL cert paths

- [ ] **T70** — Enable systemd services: node-app, nginx, coturn

- [ ] **T71** — Add TURN server to ICE config in client.js (read from server on login response):
  - Modify `POST /login` to return `turnServers` object
  - Client uses this to build ICE config

- [ ] **T72** — Final test: 3+ users from different networks, share VLC window, verify smooth playback

---

## DONE ✅

All 72 tasks complete = app is production-ready.
