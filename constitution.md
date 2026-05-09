# CONSTITUTION.md
## Video Call App — Core Principles & Non-Negotiables

> This document defines the immutable laws of this project. Every decision — architectural, visual, or technical — must conform to these principles. If any spec, plan, or instruction contradicts this document, THIS document wins.

---

## PRINCIPLE 1 — SPEED IS THE PRODUCT

Screen sharing a 1080p window (e.g., VLC playing a James Bond movie) must feel **lossless and real-time** for all participants. This is not a nice-to-have. It is the entire reason this app exists.

- Latency target: **< 80ms glass-to-glass** on a LAN/good broadband
- Screen share frame drops: **zero acceptable during steady state**
- Codec: **VP8 or VP9 with uncapped bitrate** for screen share tracks
- No artificial bitrate caps on screen share streams
- Screen share tracks must use `contentHint = "detail"` (not "motion")
- SDP must be modified to **remove bandwidth constraints** on screen share

---

## PRINCIPLE 2 — NO DATABASE, NO ACCOUNTS, NO SIGN-UP

Users are hand-picked. Their credentials are hardcoded on the server. There is no registration flow, no "forgot password", no email verification, no OAuth.

- Allowed users are stored as a plain JS object in `server.js` (or a `.env` file)
- Login accepts: `username` + `password`
- Server verifies against the hardcoded list and issues a **JWT**
- JWT expires in 24 hours
- **No database of any kind** — not SQLite, not Redis, nothing

---

## PRINCIPLE 3 — ONE ROOM, AUTO-JOIN

After login, the user is **immediately placed into the single persistent call room**. There is no room selection, no lobby, no "create room" flow.

- One global room ID (e.g., `"main"`)
- Login → JWT issued → redirect to `/call` → WebSocket join fires automatically
- No UI for room management

---

## PRINCIPLE 4 — WINDOW-ONLY SCREEN SHARE

Screen share must open the browser's native picker constrained to **application windows only**. No full-desktop, no tab sharing.

```javascript
navigator.mediaDevices.getDisplayMedia({
  video: {
    displaySurface: "window",   // prefer window
    frameRate: { ideal: 60, max: 60 },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    cursor: "always"
  },
  audio: false,                 // no system audio (avoids echo)
  selfBrowserSurface: "exclude",
  surfaceSwitching: "exclude",
  preferCurrentTab: false
})
```

- If the browser ignores `displaySurface`, the user will still see the picker — that is acceptable. The code must **always request window mode**.

---

## PRINCIPLE 5 — CONTROLS ARE BINARY, MINIMAL, ALWAYS VISIBLE

Four controls, nothing else on the call screen:

| Control | Behavior |
|---|---|
| Camera toggle | On / Off |
| Mic toggle | On / Off |
| Screen Share | Start / Stop |
| Leave | Ends call, returns to login |

No chat, no reactions, no raise-hand, no recording, no virtual backgrounds.

---

## PRINCIPLE 6 — P2P FIRST, TURN AS FALLBACK

Media must never be routed through the Node.js server. The server is signaling-only.

- STUN: Google's public STUN (`stun:stun.l.google.com:19302`) + your own coturn
- TURN: coturn on the same EC2 instance, used only when direct P2P fails
- The server **never touches audio/video/screen data**

---

## PRINCIPLE 7 — HTTPS EVERYWHERE

WebRTC and `getDisplayMedia` require a **secure context**. The app must run on HTTPS in production.

- Local dev: `localhost` (browsers treat it as secure)
- Production: Let's Encrypt SSL via nginx reverse proxy

---

## PRINCIPLE 8 — SIMPLICITY OVER ABSTRACTION

- Vanilla JS on the frontend. No React, no Vue, no bundlers.
- Single `server.js` file for the backend. No microservices.
- No TypeScript (reduces friction for quick iteration)
- Inline CSS is acceptable for the call page if it keeps things simple

---

## PRINCIPLE 9 — FAIL LOUDLY, RECOVER GRACEFULLY

- If camera/mic permission is denied → show clear error on screen, do not crash
- If a peer disconnects → remove their tile immediately, do not freeze
- If screen share ends (user closes picker) → revert to camera automatically
- Reconnection: Socket.io auto-reconnect enabled with exponential backoff

---

## PRINCIPLE 10 — SECURITY IS NOT OPTIONAL

- JWT secret must come from environment variable, never hardcoded in git
- Hardcoded user list must be in `.env`, not committed to source control
- CORS must be locked to your domain in production (not `"*"`)
- TURN credentials must be per-session (HMAC time-limited), not static
