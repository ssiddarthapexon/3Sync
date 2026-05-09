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

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET not set in .env');
}

// Parse USERS from env: "alice:pass1,bob:pass2"
const USERS = Object.fromEntries(
  (process.env.USERS || '').split(',').map(entry => {
    const [username, password] = entry.trim().split(':');
    return [username, password];
  })
);

console.log('[*] Loaded users:', Object.keys(USERS).join(', '));

// In-memory room
const room = []; // [{ socketId, username }]

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── REST ──────────────────────────────────────

/**
 * POST /login
 * Accept { username, password }
 * Return { success: true, token, username, turnServers }
 */
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password || !USERS[username] || USERS[username] !== password) {
    return res.status(401).json({
      success: false,
      error: 'Invalid username or password'
    });
  }

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });

  // Build TURN server info (if configured)
  const turnServers = process.env.TURN_HOST
    ? {
        urls: [
          `turn:${process.env.TURN_HOST}:3478`,
          `turns:${process.env.TURN_HOST}:443`
        ],
        username: process.env.TURN_USER || 'turnuser',
        credential: process.env.TURN_PASS || 'turnpassword'
      }
    : null;

  res.json({
    success: true,
    token,
    username,
    turnServers
  });
});

/**
 * GET /api/health
 */
app.get('/api/health', (_, res) => {
  res.json({ ok: true, users: room.length });
});

/**
 * GET /call
 * Serve call.html
 */
app.get('/call', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'call.html'));
});

// ── SOCKET AUTH ───────────────────────────────

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No token'));

  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

// ── SOCKET EVENTS ─────────────────────────────

io.on('connection', (socket) => {
  console.log(`[+] ${socket.user.username} connected (${socket.id})`);

  // User joins room
  socket.on('join-room', () => {
    const user = { socketId: socket.id, username: socket.user.username };

    // Send current room state to the joining user
    const existingUsers = room.map(u => ({
      socketId: u.socketId,
      username: u.username
    }));

    socket.emit('user-joined', {
      userId: socket.id,
      username: socket.user.username,
      existingUsers,
      isSelf: true
    });

    // Add to room
    room.push(user);

    // Tell everyone else about the new user
    socket.broadcast.emit('user-joined', {
      userId: socket.id,
      username: socket.user.username,
      isSelf: false
    });

    console.log(`[*] Room now has ${room.length} users`);
  });

  // Signaling relay (server never inspects payload)
  socket.on('offer', (data) => {
    const targetSocket = io.sockets.sockets.get(data.to);
    if (targetSocket) {
      targetSocket.emit('offer', {
        from: socket.id,
        fromUsername: socket.user.username,
        sdp: data.sdp
      });
    }
  });

  socket.on('answer', (data) => {
    const targetSocket = io.sockets.sockets.get(data.to);
    if (targetSocket) {
      targetSocket.emit('answer', {
        from: socket.id,
        sdp: data.sdp
      });
    }
  });

  socket.on('ice-candidate', (data) => {
    const targetSocket = io.sockets.sockets.get(data.to);
    if (targetSocket) {
      targetSocket.emit('ice-candidate', {
        from: socket.id,
        candidate: data.candidate
      });
    }
  });

  // Screen share signaling relay
  socket.on('screen-offer', (data) => {
    const targetSocket = io.sockets.sockets.get(data.to);
    if (targetSocket) {
      targetSocket.emit('screen-offer', {
        from: socket.id,
        fromUsername: socket.user.username,
        sdp: data.sdp
      });
    }
  });

  socket.on('screen-answer', (data) => {
    const targetSocket = io.sockets.sockets.get(data.to);
    if (targetSocket) {
      targetSocket.emit('screen-answer', {
        from: socket.id,
        sdp: data.sdp
      });
    }
  });

  socket.on('screen-ice-candidate', (data) => {
    const targetSocket = io.sockets.sockets.get(data.to);
    if (targetSocket) {
      targetSocket.emit('screen-ice-candidate', {
        from: socket.id,
        candidate: data.candidate
      });
    }
  });

  // State broadcasts (server relays to all others)
  socket.on('screen-share-started', (data) => {
    socket.broadcast.emit('screen-share-started', {
      from: socket.id,
      fromUsername: socket.user.username
    });
  });

  socket.on('screen-share-stopped', (data) => {
    socket.broadcast.emit('screen-share-stopped', {
      from: socket.id,
      fromUsername: socket.user.username
    });
  });

  socket.on('user-media-state', (data) => {
    socket.broadcast.emit('user-media-state', {
      from: socket.id,
      fromUsername: socket.user.username,
      camera: data.camera,
      mic: data.mic
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    const idx = room.findIndex(u => u.socketId === socket.id);
    if (idx !== -1) {
      const user = room.splice(idx, 1)[0];
      io.emit('user-left', { userId: socket.id, username: user.username });
      console.log(`[-] ${user.username} disconnected. Room now has ${room.length} users`);
    }
  });

  // Error handling
  socket.on('error', (err) => {
    console.error(`[!] Socket error for ${socket.user.username}:`, err);
  });
});

// ── START ─────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 WebRTC signaling ready`);
  console.log(`🔐 JWT secret: ${JWT_SECRET.substring(0, 10)}...`);
  console.log(`👥 Hardcoded users: ${Object.keys(USERS).join(', ')}\n`);
});
