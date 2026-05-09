// ============================================
// CLIENT.JS — WebRTC + Socket.io Core Logic
// ============================================

// ── STATE ─────────────────────────────────────
let localStream = null;
let screenStream = null;
let socket = null;
const peerConnections = new Map(); // socketId → RTCPeerConnection
let cameraOn = true;
let micOn = true;
let isSharing = false;
let localUsername = null;

let iceConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
};

// ── INIT ──────────────────────────────────────
async function init() {
  const token = sessionStorage.getItem('token');
  localUsername = sessionStorage.getItem('username');

  if (!token) {
    window.location.href = '/';
    return;
  }

  // Add TURN servers from login response
  const turnServersStr = sessionStorage.getItem('turnServers');
  const turnServers = turnServersStr ? JSON.parse(turnServersStr) : null;
  if (turnServers) {
    iceConfig.iceServers.push(turnServers);
  }

  // Get local media
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false
      }
    });
    addVideoTile(null, localUsername, true, localStream);
  } catch (err) {
    showError('Camera/mic access denied. Check browser permissions.');
    // Don't return — allow joining without video
  }

  // Connect socket
  socket = io({ auth: { token } });
  
  socket.on('connect', () => {
    console.log('[+] Socket connected');
    socket.emit('join-room');
  });

  socket.on('connect_error', (err) => {
    showError('Connection error: ' + err.message);
  });

  // WebRTC events
  socket.on('user-joined', handleUserJoined);
  socket.on('user-left', handleUserLeft);
  socket.on('offer', handleOffer);
  socket.on('answer', handleAnswer);
  socket.on('ice-candidate', handleIceCandidate);
  socket.on('screen-share-started', handleScreenShareStarted);
  socket.on('screen-share-stopped', handleScreenShareStopped);
  socket.on('user-media-state', handleMediaState);
  
  // Screen share WebRTC events
  socket.on('screen-offer', handleScreenOffer);
  socket.on('screen-answer', handleScreenAnswer);
  socket.on('screen-ice-candidate', handleScreenIceCandidate);

  // Control buttons
  document.getElementById('btn-camera').addEventListener('click', toggleCamera);
  document.getElementById('btn-mic').addEventListener('click', toggleMic);
  document.getElementById('btn-share').addEventListener('click', toggleScreenShare);
  document.getElementById('btn-leave').addEventListener('click', leaveCall);
}

document.addEventListener('DOMContentLoaded', init);

// ── UTILITY FUNCTIONS ─────────────────────────
function showError(message) {
  const banner = document.getElementById('error-banner');
  banner.textContent = message;
  banner.style.display = 'block';
  setTimeout(() => {
    banner.style.display = 'none';
  }, 5000);
}

// ── VIDEO TILE MANAGEMENT ─────────────────────
function addVideoTile(socketId, username, isLocal, stream = null) {
  const tileId = isLocal ? 'tile-local' : `tile-${socketId}`;
  
  // Check if already exists
  if (document.getElementById(tileId)) return;

  const tile = document.createElement('div');
  tile.id = tileId;
  tile.className = `video-tile ${isLocal ? 'local' : ''}`;

  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = isLocal; // Always mute local to prevent echo
  video.playsInline = true;

  if (stream) {
    video.srcObject = stream;
  }

  const label = document.createElement('div');
  label.className = 'name-label';
  label.textContent = username;

  tile.appendChild(video);
  tile.appendChild(label);

  document.getElementById('camera-sidebar').appendChild(tile);
}

function removeVideoTile(socketId) {
  const tileId = `tile-${socketId}`;
  const tile = document.getElementById(tileId);
  if (tile) tile.remove();
}

// ── WEBRTC — PEER CONNECTIONS ────────────────
function createPeerConnection(peerId, peerUsername) {
  const pc = new RTCPeerConnection(iceConfig);
  peerConnections.set(peerId, pc);

  // Add local tracks
  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  // ICE candidates
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      socket.emit('ice-candidate', { to: peerId, candidate });
    }
  };

  // Remote track
  pc.ontrack = (event) => {
    const tileId = `tile-${peerId}`;
    let tile = document.getElementById(tileId);
    if (!tile) {
      addVideoTile(peerId, peerUsername, false);
      tile = document.getElementById(tileId);
    }
    const video = tile.querySelector('video');
    if (video && video.srcObject !== event.streams[0]) {
      video.srcObject = event.streams[0];
    }
  };

  // Connection state
  pc.onconnectionstatechange = () => {
    console.log(`[${peerUsername}] connection state: ${pc.connectionState}`);
    if (pc.connectionState === 'failed') {
      console.log(`[${peerUsername}] connection failed, closing`);
      pc.close();
      peerConnections.delete(peerId);
      removeVideoTile(peerId);
    } else if (pc.connectionState === 'disconnected') {
      // Might reconnect
    }
  };

  return pc;
}

// ── OFFER/ANSWER FLOW ─────────────────────────
async function handleUserJoined({ userId, username, existingUsers, isSelf }) {
  if (isSelf) {
    console.log('[+] You joined the room');
    // Create peer connections for existing users
    if (existingUsers && Array.isArray(existingUsers)) {
      for (const user of existingUsers) {
        await createOfferAndSend(user.socketId, user.username);
      }
    }
  } else {
    // New user joined, they will send us an offer
    console.log(`[+] ${username} joined`);
    addVideoTile(userId, username, false);
    
    // If we're sharing screen, send them our screen share too
    if (isSharing && screenStream) {
      const screenPc = createScreenPeerConnection(userId);
      screenStream.getTracks().forEach(track => screenPc.addTrack(track, screenStream));
      
      try {
        let offer = await screenPc.createOffer();
        let sdp = patchSDPForScreenShare(offer.sdp);
        const patchedOffer = new RTCSessionDescription({ type: 'offer', sdp });
        await screenPc.setLocalDescription(patchedOffer);
        socket.emit('screen-offer', { to: userId, sdp: patchedOffer });
      } catch (err) {
        console.error('Error creating screen share offer for new user:', err);
      }
    }
  }
}

async function createOfferAndSend(peerId, peerUsername) {
  let pc = peerConnections.get(peerId);
  if (!pc) {
    pc = createPeerConnection(peerId, peerUsername);
  }

  try {
    let offer = await pc.createOffer();
    let sdp = offer.sdp;
    if (isSharing) {
      sdp = patchSDPForScreenShare(sdp);
    }
    const patchedOffer = new RTCSessionDescription({ type: 'offer', sdp });
    await pc.setLocalDescription(patchedOffer);
    socket.emit('offer', { to: peerId, sdp: patchedOffer });
  } catch (err) {
    console.error(`Error creating offer for ${peerUsername}:`, err);
  }
}

async function handleOffer({ from, sdp, fromUsername }) {
  let pc = peerConnections.get(from);
  if (!pc) {
    pc = createPeerConnection(from, fromUsername);
    addVideoTile(from, fromUsername, false);
  }

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    let answer = await pc.createAnswer();
    let answerSdp = answer.sdp;
    if (isSharing) {
      answerSdp = patchSDPForScreenShare(answerSdp);
    }
    const patchedAnswer = new RTCSessionDescription({ type: 'answer', sdp: answerSdp });
    await pc.setLocalDescription(patchedAnswer);
    socket.emit('answer', { to: from, sdp: patchedAnswer });
  } catch (err) {
    console.error(`Error handling offer from ${fromUsername}:`, err);
  }
}

async function handleAnswer({ from, sdp }) {
  const pc = peerConnections.get(from);
  if (pc) {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (err) {
      console.error(`Error handling answer from ${from}:`, err);
    }
  }
}

async function handleIceCandidate({ from, candidate }) {
  const pc = peerConnections.get(from);
  if (pc && candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error(`Error adding ICE candidate from ${from}:`, err);
    }
  }
}

function handleUserLeft({ userId }) {
  const pc = peerConnections.get(userId);
  if (pc) {
    pc.close();
    peerConnections.delete(userId);
  }
  removeVideoTile(userId);
  
  // Also close screen peer connection if exists
  const screenPc = peerConnections.get(`${userId}-screen`);
  if (screenPc) {
    screenPc.close();
    peerConnections.delete(`${userId}-screen`);
  }
}

// ── SCREEN SHARE WEBRTC HANDLERS ──────────────
async function handleScreenOffer({ from, sdp, fromUsername }) {
  console.log(`[Screen] Received screen offer from ${fromUsername}`);
  
  // Close existing screen connection if any
  const existingPc = peerConnections.get(`${from}-screen`);
  if (existingPc) {
    existingPc.close();
  }
  
  // Create a peer connection to receive screen share
  const screenPc = new RTCPeerConnection(iceConfig);
  peerConnections.set(`${from}-screen`, screenPc);
  
  screenPc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      socket.emit('screen-ice-candidate', { to: from, candidate });
    }
  };
  
  screenPc.ontrack = (event) => {
    console.log('[Screen] Received remote screen track from', fromUsername);
    // Display the received screen share stream
    if (event.streams && event.streams[0]) {
      displayScreenShare(event.streams[0]);
    }
  };
  
  screenPc.onconnectionstatechange = () => {
    console.log(`[Screen] Connection state with ${fromUsername}:`, screenPc.connectionState);
  };
  
  screenPc.onerror = (err) => {
    console.error(`[Screen] Error with ${fromUsername}:`, err);
  };
  
  try {
    console.log('[Screen] Setting remote description from offer');
    await screenPc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await screenPc.createAnswer();
    console.log('[Screen] Created answer, setting local description');
    await screenPc.setLocalDescription(answer);
    console.log('[Screen] Sending answer back to', fromUsername);
    socket.emit('screen-answer', { to: from, sdp: answer });
  } catch (err) {
    console.error('[Screen] Error handling screen offer:', err);
  }
}

async function handleScreenAnswer({ from, sdp }) {
  const screenPc = peerConnections.get(`${from}-screen`);
  if (screenPc) {
    try {
      await screenPc.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (err) {
      console.error('Error handling screen answer:', err);
    }
  }
}

async function handleScreenIceCandidate({ from, candidate }) {
  const screenPc = peerConnections.get(`${from}-screen`);
  if (screenPc && candidate) {
    try {
      await screenPc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('Error adding screen ICE candidate:', err);
    }
  }
}

// ── SDP PATCHING FOR SCREEN SHARE ────────────
function patchSDPForScreenShare(sdp) {
  // Remove existing bandwidth constraints
  let patched = sdp.replace(/b=AS:.*\r\n/g, '');
  patched = patched.replace(/b=TIAS:.*\r\n/g, '');
  
  // Insert high-bandwidth directives after m=video line
  patched = patched.replace(
    /m=video.*\r\n/g,
    (match) => match + 'b=AS:50000\r\nb=TIAS:50000000\r\n'
  );
  
  return patched;
}

// ── SCREEN SHARE ──────────────────────────────
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
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'exclude',
      preferCurrentTab: false
    });

    const screenTrack = screenStream.getVideoTracks()[0];
    screenTrack.contentHint = 'detail';

    // Create new peer connections for screen sharing (separate from camera)
    // Only iterate camera connections (not screen connections)
    for (const [peerId, pc] of peerConnections) {
      // Skip if this is already a screen connection
      if (peerId.endsWith('-screen')) continue;
      
      const screenPc = createScreenPeerConnection(peerId);
      screenStream.getTracks().forEach(track => screenPc.addTrack(track, screenStream));
      
      // Create and send offer for screen share
      try {
        let offer = await screenPc.createOffer();
        let sdp = patchSDPForScreenShare(offer.sdp);
        const patchedOffer = new RTCSessionDescription({ type: 'offer', sdp });
        await screenPc.setLocalDescription(patchedOffer);
        socket.emit('screen-offer', { to: peerId, sdp: patchedOffer });
      } catch (err) {
        console.error('Error creating screen share offer:', err);
      }
    }

    // Display OWN screen share in the fixed area
    displayScreenShare(screenStream);

    // Listen for screen share end
    screenTrack.addEventListener('ended', () => {
      console.log('[Screen] Screen track ended by user');
      stopScreenShare();
    });

    isSharing = true;
    updateShareButtonState();
    socket.emit('screen-share-started', {});

  } catch (err) {
    if (err.name === 'NotAllowedError') {
      console.log('Screen share cancelled by user');
    } else {
      showError('Screen share error: ' + err.message);
    }
  }
}

function createScreenPeerConnection(peerId) {
  const screenPc = new RTCPeerConnection(iceConfig);
  
  screenPc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      socket.emit('screen-ice-candidate', { to: peerId, candidate });
    }
  };

  screenPc.onconnectionstatechange = () => {
    console.log(`Screen share connection to ${peerId}: ${screenPc.connectionState}`);
    if (screenPc.connectionState === 'failed' || screenPc.connectionState === 'disconnected') {
      console.error(`Screen share connection to ${peerId} failed`);
    }
  };
  
  screenPc.onerror = (err) => {
    console.error(`Screen peer connection error with ${peerId}:`, err);
  };

  // Store with special key
  peerConnections.set(`${peerId}-screen`, screenPc);
  return screenPc;
}

function displayScreenShare(stream) {
  const placeholder = document.getElementById('screen-share-placeholder');
  const video = document.getElementById('screen-share-video');
  
  placeholder.style.display = 'none';
  video.style.display = 'block';
  video.srcObject = stream;
}

async function stopScreenShare() {
  if (!isSharing) return;

  try {
    console.log('[Screen] Stopping screen share');
    
    // Stop all screen share tracks
    if (screenStream) {
      screenStream.getTracks().forEach(track => {
        console.log('[Screen] Stopping track:', track.kind);
        track.stop();
      });
      screenStream = null;
    }

    // Close all screen peer connections
    const keysToDelete = [];
    for (const [key, pc] of peerConnections) {
      if (key.endsWith('-screen')) {
        console.log('[Screen] Closing screen connection:', key);
        pc.close();
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => peerConnections.delete(key));

    // Hide screen share display
    hideScreenShare();

    isSharing = false;
    updateShareButtonState();
    socket.emit('screen-share-stopped', {});
    console.log('[Screen] Screen share stopped successfully');

  } catch (err) {
    console.error('Error stopping screen share:', err);
  }
}

function hideScreenShare() {
  const placeholder = document.getElementById('screen-share-placeholder');
  const video = document.getElementById('screen-share-video');
  
  video.style.display = 'none';
  video.srcObject = null;
  placeholder.style.display = 'flex';
}

function toggleScreenShare() {
  if (isSharing) {
    console.log('[Screen] Toggle: Stopping screen share');
    stopScreenShare();
  } else {
    console.log('[Screen] Toggle: Starting screen share');
    startScreenShare();
  }
}

function handleScreenShareStarted({ from, fromUsername }) {
  // Screen share will arrive via screen-offer socket event
  console.log(`${fromUsername} started screen sharing`);
}

function handleScreenShareStopped({ from }) {
  // Close and remove screen peer connection for this user
  const screenPc = peerConnections.get(`${from}-screen`);
  if (screenPc) {
    screenPc.close();
    peerConnections.delete(`${from}-screen`);
  }
  
  // Hide screen share display
  hideScreenShare();
}

// ── CONTROLS ──────────────────────────────────
function toggleCamera() {
  if (!localStream) return;
  
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    cameraOn = !cameraOn;
    videoTrack.enabled = cameraOn;
    updateCameraButtonState();
    socket.emit('user-media-state', { camera: cameraOn, mic: micOn });
  }
}

function toggleMic() {
  if (!localStream) return;
  
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    micOn = !micOn;
    audioTrack.enabled = micOn;
    updateMicButtonState();
    socket.emit('user-media-state', { camera: cameraOn, mic: micOn });
  }
}

function leaveCall() {
  // Close all peer connections
  for (const [peerId, pc] of peerConnections) {
    pc.close();
  }
  peerConnections.clear();

  // Stop all local tracks
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
  }

  // Disconnect socket
  if (socket) {
    socket.disconnect();
  }

  // Clear session and redirect
  sessionStorage.clear();
  window.location.href = '/';
}

function handleMediaState({ from, camera, mic }) {
  const tileId = `tile-${from}`;
  const tile = document.getElementById(tileId);
  if (!tile) return;

  const label = tile.querySelector('.name-label');
  if (!label) return;

  // Clear existing muted indicator
  const existingMuted = label.querySelector('.muted-indicator');
  if (existingMuted) existingMuted.remove();

  // Add muted indicator if needed
  if (!mic) {
    const muteIcon = document.createElement('span');
    muteIcon.className = 'muted-indicator';
    muteIcon.textContent = '🔇';
    label.appendChild(muteIcon);
  }
}

// ── BUTTON STATE ──────────────────────────────
function updateCameraButtonState() {
  const btn = document.getElementById('btn-camera');
  if (cameraOn) {
    btn.classList.add('active');
    btn.classList.remove('inactive');
  } else {
    btn.classList.remove('active');
    btn.classList.add('inactive');
  }
}

function updateMicButtonState() {
  const btn = document.getElementById('btn-mic');
  if (micOn) {
    btn.classList.add('active');
    btn.classList.remove('inactive');
  } else {
    btn.classList.remove('active');
    btn.classList.add('inactive');
  }
}

function updateShareButtonState() {
  const btn = document.getElementById('btn-share');
  if (isSharing) {
    btn.classList.add('active');
  } else {
    btn.classList.remove('active');
  }
}
