// Firebase Infrastructure Initialization
const firebaseConfig = {
  databaseURL: "https://full-stack-web-3ee1c-default-rtdb.firebaseio.com/"
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Socket Initialization
const socket = io();

// Application Engine States
let localAudioStream = null;
const peerConnections = {}; // Key: targetSocketId, Value: RTCPeerConnection
let currentOperatorId = "";
let isVoiceActive = false;
let isAudioMuted = false;
let isTelemetryActive = false;
let geolocationWatchId = null;

// Production STUN/TURN Infrastructure Rules
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
};

// Application Bootstrapping
window.addEventListener('DOMContentLoaded', () => {
  initializeUserSession();
  setupFirebaseConsoleListener();
});

function initializeUserSession() {
  currentOperatorId = document.getElementById('riderSelect').value;
  socket.emit('join-room', { riderId: currentOperatorId });
  updateStatusDisplay(`CONNECTED AS: ${currentOperatorId}`);
}

// Full Audio Mesh Controller
async function toggleVoiceMesh() {
  const voiceBtn = document.getElementById('voiceControlBtn');
  const muteBtn = document.getElementById('muteControlBtn');

  if (!isVoiceActive) {
    try {
      // Audio Processing Configuration
      localAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          sampleRate: 48000,
          channelCount: 1
        },
        video: false
      });

      isVoiceActive = true;
      voiceBtn.className = "btn btn-rose";
      voiceBtn.innerHTML = `<i class="fa-solid fa-phone-slash"></i> TERMINATE VOICE MESH`;
      muteBtn.disabled = false;
      
      updateStatusDisplay("VOICE MESH ACTIVE");

      // Signal joining state to trigger peer discovery
      socket.emit('join-room', { riderId: currentOperatorId });

      database.ref(`enterprise_voice_states/${currentOperatorId}`).set({
        active: true,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });

    } catch (err) {
      console.error("[Hardware Failure]: ", err);
      alert("Microphone hardware access denied or unavailable. Grant browser permission.");
    }
  } else {
    terminateVoiceMesh();
  }
}

function terminateVoiceMesh() {
  if (localAudioStream) {
    localAudioStream.getTracks().forEach(track => track.stop());
    localAudioStream = null;
  }

  Object.keys(peerConnections).forEach(socketId => {
    peerConnections[socketId].close();
    delete peerConnections[socketId];
  });

  document.getElementById('remoteAudioContainer').innerHTML = "";

  isVoiceActive = false;
  const voiceBtn = document.getElementById('voiceControlBtn');
  const muteBtn = document.getElementById('muteControlBtn');

  voiceBtn.className = "btn btn-emerald";
  voiceBtn.innerHTML = `<i class="fa-solid fa-microphone"></i> INITIALIZE VOICE MESH`;
  muteBtn.disabled = true;
  muteBtn.className = "btn btn-slate";
  muteBtn.innerHTML = `<i class="fa-solid fa-volume-xmark"></i> MUTE AUDIO`;
  isAudioMuted = false;

  updateStatusDisplay("SYSTEM READY");

  database.ref(`enterprise_voice_states/${currentOperatorId}`).remove();
}

// Socket Signaling Protocols
socket.on('room-peers', (peers) => {
  if (!isVoiceActive || !localAudioStream) return;
  peers.forEach(peer => {
    initiatePeerConnection(peer.socketId, true);
  });
});

socket.on('signal-offer', async ({ callerSocketId, offer }) => {
  if (!isVoiceActive || !localAudioStream) return;
  const pc = initiatePeerConnection(callerSocketId, false);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('signal-answer', { targetSocketId: callerSocketId, answer: answer });
});

socket.on('signal-answer', async ({ responderSocketId, answer }) => {
  const pc = peerConnections[responderSocketId];
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }
});

socket.on('ice-candidate', async ({ fromSocketId, candidate }) => {
  const pc = peerConnections[fromSocketId];
  if (pc && candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error("[ICE Error]", e);
    }
  }
});

socket.on('peer-disconnected', ({ socketId }) => {
  if (peerConnections[socketId]) {
    peerConnections[socketId].close();
    delete peerConnections[socketId];
  }
  const audioElem = document.getElementById(`audio-node-${socketId}`);
  if (audioElem) audioElem.remove();
});

// Peer Connection Handler
function initiatePeerConnection(targetSocketId, isInitiator) {
  if (peerConnections[targetSocketId]) {
    return peerConnections[targetSocketId];
  }

  const pc = new RTCPeerConnection(rtcConfig);
  peerConnections[targetSocketId] = pc;

  // Stream Injection
  localAudioStream.getTracks().forEach(track => pc.addTrack(track, localAudioStream));

  // Candidate Exchange
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', { targetSocketId: targetSocketId, candidate: event.candidate });
    }
  };

  // Remote Stream Attachment Execution
  pc.ontrack = (event) => {
    attachRemoteAudioStream(targetSocketId, event.streams[0]);
  };

  // Negotiate Connections
  if (isInitiator) {
    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal-offer', { targetSocketId: targetSocketId, offer: offer });
      } catch (err) {
        console.error("[Negotiation Error]", err);
      }
    };
  }

  return pc;
}

function attachRemoteAudioStream(socketId, stream) {
  let audioElem = document.getElementById(`audio-node-${socketId}`);
  if (!audioElem) {
    audioElem = document.createElement('audio');
    audioElem.id = `audio-node-${socketId}`;
    audioElem.autoplay = true;
    audioElem.playsInline = true;
    document.getElementById('remoteAudioContainer').appendChild(audioElem);
  }
  audioElem.srcObject = stream;
  audioElem.play().catch(e => console.log("[Autoplay Engine Intercept]", e));
}

function toggleMute() {
  if (!localAudioStream) return;
  isAudioMuted = !isAudioMuted;
  localAudioStream.getAudioTracks()[0].enabled = !isAudioMuted;
  
  const muteBtn = document.getElementById('muteControlBtn');
  if (isAudioMuted) {
    muteBtn.className = "btn btn-amber";
    muteBtn.innerHTML = `<i class="fa-solid fa-microphone"></i> UNMUTE AUDIO`;
  } else {
    muteBtn.className = "btn btn-slate";
    muteBtn.innerHTML = `<i class="fa-solid fa-volume-xmark"></i> MUTE AUDIO`;
  }
}

// Telemetry Logic
function toggleTelemetryBroadcast() {
  const btn = document.getElementById('telemetryBroadcasterBtn');

  if (!isTelemetryActive) {
    if (!("geolocation" in navigator)) {
      alert("Geolocation unavailable on hardware profile.");
      return;
    }

    isTelemetryActive = true;
    btn.className = "btn btn-rose";
    btn.innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> TERMINATE TELEMETRY`;

    geolocationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        const speedKmh = position.coords.speed ? (position.coords.speed * 3.6).toFixed(1) : "0.0";
        const latitude = position.coords.latitude.toFixed(6);
        const longitude = position.coords.longitude.toFixed(6);

        document.getElementById('telemetrySpeed').innerHTML = `${speedKmh} <small>km/h</small>`;
        document.getElementById('telemetryLat').innerText = latitude;
        document.getElementById('telemetryLng').innerText = longitude;

        // Atomic write to Firebase
        database.ref(`enterprise_telemetry/${currentOperatorId}`).set({
          operator: currentOperatorId,
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          speedKmh: parseFloat(speedKmh),
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });
      },
      (error) => console.error("[GPS Error]", error),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  } else {
    isTelemetryActive = false;
    navigator.geolocation.clearWatch(geolocationWatchId);
    btn.className = "btn btn-sky";
    btn.innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> START TELEMETRY BROADCAST`;
  }
}

// Enterprise Messaging Integration
function dispatchMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  database.ref("enterprise_console_logs").push({
    operator: currentOperatorId,
    payload: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });

  input.value = "";
}

function setupFirebaseConsoleListener() {
  database.ref("enterprise_console_logs").limitToLast(40).on("child_added", (snapshot) => {
    const data = snapshot.val();
    const logBox = document.getElementById('consoleLogs');
    const msgDiv = document.createElement('div');
    msgDiv.className = "console-entry";
    
    const time = data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : "";
    msgDiv.innerHTML = `<span class="timestamp">[${time}]</span> <strong>${data.operator}:</strong> ${data.payload}`;
    
    logBox.appendChild(msgDiv);
    logBox.scrollTop = logBox.scrollHeight;
  });
}

function updateStatusDisplay(msg) {
  document.getElementById('networkStatus').innerText = msg;
}
