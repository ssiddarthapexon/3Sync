# PROMPT.md / INSTRUCTION.md
## Master Prompt for VS Code GitHub Copilot

> Copy and paste this entire prompt to GitHub Copilot Chat in VS Code to start the build. Feed it the supporting documents as context.

---

## HOW TO USE THIS WITH COPILOT

1. Open VS Code in an empty folder called `video-call-app`
2. Open Copilot Chat (Ctrl+Shift+I or Cmd+Shift+I)
3. Use `#file` to attach the context documents:
   - `@workspace #file:constitution.md #file:spec.md #file:plan.md #file:task.md #file:implement.md`
4. Paste the prompt below

---

## THE PROMPT

```
You are building a private, invite-only WebRTC video calling app from scratch.

Read and internalize these documents before writing any code:
- constitution.md — non-negotiable principles (SPEED is #1)
- spec.md — full functional and technical specification
- plan.md — architecture decisions and phase breakdown
- task.md — ordered task list (work through it top to bottom)
- implement.md — exact code patterns for WebRTC and screen share

---

## WHAT THIS APP DOES

A private video call app for 2–8 invited people. The killer feature is blazing-fast, lossless screen sharing of application windows (e.g., watching a 1080p VLC movie together with no lag). Think of it as a private, self-hosted video call where the host can share their screen and it feels like local playback for everyone.

---

## HARD RULES (from constitution.md — never violate these)

1. **Speed is the product.** Screen sharing must be fast enough to watch a 1080p movie with no dropped frames. This means:
   - VP9 codec preferred
   - SDP must be patched to inject `b=AS:50000` and `b=TIAS:50000000` after the `m=video` line
   - RTCRtpSender parameters: `maxBitrate = 50_000_000`, `priority = 'high'`
   - `contentHint = 'detail'` on the screen share track

2. **No database.** Users are hardcoded in `.env` as `USERS=alice:pass1,bob:pass2`.

3. **One room, auto-join.** After login → immediately join room `"main"`. No room picker.

4. **Window-only screen share.** Always request `displaySurface: "window"` in getDisplayMedia.

5. **Four controls only.** Camera toggle, Mic toggle, Screen Share toggle, Leave button.

6. **P2P only.** The Node.js server handles signaling only. Media never touches the server.

7. **Vanilla JS frontend.** No React, no Vue, no bundlers. Pure HTML/CSS/JavaScript.

8. **Single `server.js`.** No microservices. One file for the entire backend.

---

## START HERE — BUILD IN THIS ORDER

### Step 1: Scaffold the project
Create this exact folder structure:
```
video-call-app/
├── public/
│   ├── index.html    ← login page
│   ├── call.html     ← call page  
│   ├── style.css     ← all styles
│   └── client.js     ← all WebRTC logic
├── server.js          ← complete backend
├── package.json
├── .env               ← USERS, JWT_SECRET, TURN config
├── .env.example
└── .gitignore
```

### Step 2: Build server.js
The complete server in one file. Use the exact code structure from implement.md Section 1. Key points:
- Parse `USERS` from env
- `POST /login` checks credentials, returns JWT + TURN server info
- Socket.io with JWT auth middleware on every connection
- In-memory room array: `const room = []`
- Relay events: offer, answer, ice-candidate (server just forwards, never inspects)
- Broadcast events: screen-share-started, screen-share-stopped, user-media-state
- `join-room` handler: tell new user about existing users, tell everyone else about new user

### Step 3: Build the login page (public/index.html)
- Dark theme, centered card
- Username + password fields
- "Join Call" button
- On submit: POST /login, store token+username+turnServers in sessionStorage, redirect to /call
- Show inline error on failure
- No sign-up, no forgot password

### Step 4: Build the call page (public/call.html + public/client.js)
Use the exact structure from implement.md Sections 2–8.

**call.html structure:**
- `#video-grid` (CSS grid container)
- `#controls` bar fixed at bottom with 4 buttons
- That's it

**client.js — follow this exact order:**
1. On page load: check sessionStorage for token, redirect if missing
2. getUserMedia (camera + mic)
3. Add local video tile (muted!)
4. Connect Socket.io with token in auth
5. On connect: emit join-room
6. Handle user-joined, user-left, offer, answer, ice-candidate
7. createPeerConnection function (from implement.md Section 3)
8. offer/answer/ICE flows (from implement.md Section 4)
9. Camera toggle, mic toggle, leave button
10. Screen share start/stop (from implement.md Section 5)
11. SDP patching (from implement.md Section 6)

### Step 5: Style everything (public/style.css)
- Dark theme: `#0a0a0a` background, `#111` tiles
- Video grid: `display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 8px;`
- Each tile: black background, overflow hidden, border-radius 8px
- Local video: `transform: scaleX(-1)` (mirror)
- Name label: absolute bottom-left, semi-transparent dark bg, white text
- Controls bar: fixed bottom-center, dark bg, flexbox, 4 buttons
- Camera/Mic active: green. Inactive: red.
- Share active: orange with subtle pulse animation
- Leave: always red
- Screen sharing layout class `.screen-sharing` for grid when someone shares

---

## SCREEN SHARE — THE MOST IMPORTANT FEATURE

This is not an afterthought. It is the entire reason this app exists. Implement it exactly as specified in implement.md Section 5.

The critical path:
1. `getDisplayMedia` with `displaySurface: "window"`, 60fps, 1920x1080
2. Set `contentHint = "detail"` on the video track
3. `replaceTrack` in ALL peer connections (no renegotiation needed)
4. Set sender parameters: `maxBitrate: 50_000_000`, `priority: 'high'`
5. Emit `screen-share-started` to server
6. On track `ended` event: call stopScreenShare automatically
7. In stopScreenShare: replaceTrack back to camera, reset bitrate, emit screen-share-stopped

When a remote peer shares: expand their tile to 70% of the viewport. Put camera tiles in a sidebar column on the right.

---

## WEBRTC — COMMON MISTAKES TO AVOID

From implement.md Section 10:
- ALWAYS mute local video element (`video.muted = true`) to prevent echo
- ALWAYS set `video.playsInline = true`
- Queue ICE candidates if remote description isn't set yet
- Always `try/catch` around `replaceTrack` and `setParameters`
- Check `if (video.srcObject !== event.streams[0])` before setting srcObject
- Stop all screenStream tracks when screen share ends
- Use `sessionStorage`, NOT `localStorage` for the token

---

## CREDENTIALS SETUP

Create `.env` with:
```
USERS=alice:pass123,bob:pass456,charlie:pass789
JWT_SECRET=generate-a-64-char-random-string-here
PORT=3000
TURN_HOST=your-domain.com
TURN_USER=turnuser
TURN_PASS=turnpassword
```

The server reads this at startup. No database. No user management UI. To add a user: edit `.env`, restart server.

---

## LOCAL TESTING

After building:
```bash
npm install
npm run dev
```

Open two browser tabs (or two different browsers):
- Tab 1: http://localhost:3000 → login as alice
- Tab 2: http://localhost:3000 → login as bob

Both should see each other's video. Share a window in Tab 1. Tab 2 should see it instantly.

---

## AFTER THE APP WORKS LOCALLY

Only then, deploy to EC2:
1. t3.small Ubuntu 22.04 LTS
2. Install Node.js 20 via nvm
3. Transfer code, `npm install --production`
4. Install nginx + certbot (SSL)
5. Install coturn (TURN server)
6. Configure systemd to run node server as a service
7. Open ports: 80, 443, 3478/UDP, 3478/TCP, 5349/TCP, 49152-65535/UDP

Nginx reverse proxy config and coturn config are in plan.md Phase 5.

---

## SUCCESS CRITERIA

The app is done when:
- [ ] Login with hardcoded credentials works
- [ ] After login, immediately placed in call (no room picker)
- [ ] Camera and mic work, toggleable with buttons
- [ ] 2+ users can see and hear each other
- [ ] Screen share shows a window picker (not full desktop, not tabs)
- [ ] Remote users see the shared window within 500ms
- [ ] 1080p VLC movie shared = smooth playback for remote users, no lag
- [ ] User leaves → their tile disappears from others' screens
- [ ] Leave button → back to login page
```

---

## FOLLOW-UP PROMPTS (use these as you build)

### After Step 1-2 (server done):
```
The server.js is built. Now build public/index.html and the login flow. 
The login page should be dark, minimal, and only show username + password + join button.
Store token, username, and turnServers in sessionStorage on success.
Reference the style requirements in spec.md Section 4.2.
```

### After Step 3 (login done):
```
Login works. Now build public/call.html and start public/client.js.
First: just get local camera showing in the grid.
Use the exact createVideoTile function from implement.md Section 7.
Make sure local video is MUTED and MIRRORED.
```

### After Step 4 (basic video):
```
Local video shows. Now implement full WebRTC P2P.
Use the exact peer connection and offer/answer patterns from implement.md Sections 3 and 4.
Test that two browser tabs can see each other before moving to screen share.
```

### After Step 5 (P2P works):
```
P2P video works. Now implement screen share.
This is the most important feature. Use the EXACT code from implement.md Section 5.
Do not skip the RTCRtpSender bitrate parameters or the contentHint = "detail" line.
These are critical for smooth 1080p screen sharing.
```

### Debugging screen share lag:
```
Screen share is laggy. Debug in this order:
1. Check browser console for setParameters errors
2. Check if contentHint is set to "detail" (not "motion")
3. Verify SDP has b=AS:50000 line after m=video (chrome://webrtc-internals)
4. Check if the sender's maxBitrate was actually applied (getParameters after setParameters)
5. Try patchSDPForScreenShare from implement.md Section 6 if not already applied
```
