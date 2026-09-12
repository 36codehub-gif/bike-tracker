const socket = io();
let localStream = null;
const peers = {}; // Holds peer connections: { socketId: RTCPeerConnection }
let currentRiderId = "Ajay_Patel";
let isVoiceActive = false;
let isMuted = false;
let isTracking = false;
let watchId = null;

const rtcConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// 1. Join Room on Launch
currentRiderId = document.getElementById('riderSelect').value;
socket.emit('join-room', { riderId: currentRiderId });

function switchUser() {
  currentRiderId = document.getElementById('riderSelect').value;
  socket.emit('join-room', { riderId: currentRiderId });
}

// 2. WebRTC Voice Call Logic
async function toggleVoice() {
  const btn = document.getElementById('voiceBtn');
  const status = document.getElementById('voiceStatus');

  if (!isVoiceActive) {
    try {
      // Audio Processing Rules for Low Latency Mobile Communication
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      isVoiceActive = true;
      btn.className = "btn v-on";
      btn.innerHTML = `<i class="fa-solid fa-phone-slash"></i> Leave Voice`;
      document.getElementById('muteBtn').disabled = false;
      status.innerText = "Status: Connected to Voice Room";

      // Re-trigger signaling sequence once local stream is ready
      socket.emit('join-room', { riderId: currentRiderId });

    } catch (err) {
      alert("Microphone Permission Denied! Grant permission in Browser site settings.");
      console.error(err);
    }
  } else {
    leaveVoice();
  }
}

function leaveVoice() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  Object.keys(peers).forEach(id => {
    peers[id].close();
    delete peers[id];
  });

  isVoiceActive = false;
  document.getElementById('voiceBtn').className = "btn v-off";
  document.getElementById('voiceBtn').innerHTML = `<i class="fa-solid fa-microphone-slash"></i> Connect Voice`;
  document.getElementById('muteBtn').disabled = true;
  document.getElementById('voiceStatus').innerText = "Status: Voice Offline";
}

// 3. Signaling Protocols (Offer / Answer / ICE)
socket.on('all-users', (users) => {
  if (!localStream) return;
  users.forEach(user => {
    const peer = createPeer(user.socketId, socket.id, localStream);
    peers[user.socketId] = peer;
  });
});

socket.on('user-joined-signal', async (data) => {
  if (!localStream) return;
  const peer = addPeer(data.signal, data.callerID, localStream);
  peers[data.callerID] = peer;
});

socket.on('receiving-returned-signal', (data) => {
  const item = peers[data.id];
  if (item) {
    item.setRemoteDescription(new RTCSessionDescription(data.signal));
  }
});

socket.on('ice-candidate', (data) => {
  const peer = peers[data.from];
  if (peer && data.candidate) {
    peer.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(e => console.error(e));
  }
});

socket.on('user-disconnected', (id) => {
  if (peers[id]) {
    peers[id].close();
    delete peers[id];
    const el = document.getElementById(`audio-${id}`);
    if (el) el.remove();
  }
});

// Helper WebRTC Mesh Creators
function createPeer(userToSignal, callerID, stream) {
  const peer = new RTCPeerConnection(rtcConfiguration);

  stream.getTracks().forEach(track => peer.addTrack(track, stream));

  peer.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit('ice-candidate', { target: userToSignal, candidate: e.candidate });
    }
  };

  peer.ontrack = (e) => {
    handleRemoteStream(userToSignal, e.streams[0]);
  };

  peer.createOffer().then(offer => {
    peer.setLocalDescription(offer);
    socket.emit('sending-signal', { userToSignal, callerID, signal: offer });
  });

  return peer;
}

function addPeer(incomingSignal, callerID, stream) {
  const peer = new RTCPeerConnection(rtcConfiguration);

  stream.getTracks().forEach(track => peer.addTrack(track, stream));

  peer.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit('ice-candidate', { target: callerID, candidate: e.candidate });
    }
  };

  peer.ontrack = (e) => {
    handleRemoteStream(callerID, e.streams[0]);
  };

  peer.setRemoteDescription(new RTCSessionDescription(incomingSignal));
  peer.createAnswer().then(answer => {
    peer.setLocalDescription(answer);
    socket.emit('returning-signal', { signal: answer, callerID });
  });

  return peer;
}

function handleRemoteStream(id, stream) {
  let audio = document.getElementById(`audio-${id}`);
  if (!audio) {
    audio = document.createElement('audio');
    audio.id = `audio-${id}`;
    audio.autoplay = true;
    audio.playsInline = true;
    document.getElementById('audioContainer').appendChild(audio);
  }
  audio.srcObject = stream;
}

function toggleMute() {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks()[0].enabled = !isMuted;
  const btn = document.getElementById('muteBtn');
  btn.innerHTML = isMuted ? `<i class="fa-solid fa-microphone-slash"></i> Unmute` : `<i class="fa-solid fa-microphone"></i> Mute`;
}

// 4. Group Chat Logic
function sendChat() {
  const input = document.getElementById('chatMsg');
  if (!input.value.trim()) return;
  socket.emit('send-message', { message: input.value });
  input.value = "";
}

socket.on('receive-message', (data) => {
  const logs = document.getElementById('chatLogs');
  const div = document.createElement('div');
  div.className = "msg";
  div.innerHTML = `<strong>${data.sender}:</strong> ${data.message}`;
  logs.appendChild(div);
  logs.scrollTop = logs.scrollHeight;
});

// 5. GPS Telemetry tracking
function toggleTracking() {
  const btn = document.getElementById('trackBtn');
  if (!isTracking) {
    isTracking = true;
    btn.innerText = "Stop GPS Broadcast";
    btn.style.background = "#ef4444";
    watchId = navigator.geolocation.watchPosition((pos) => {
      const spd = pos.coords.speed ? (pos.coords.speed * 3.6).toFixed(1) : 0;
      document.getElementById('speedVal').innerText = `${spd} km/h`;
      socket.emit('update-location', { lat: pos.coords.latitude, lng: pos.coords.longitude, speed: spd });
    }, null, { enableHighAccuracy: true });
  } else {
    isTracking = false;
    navigator.geolocation.clearWatch(watchId);
    btn.innerText = "Start GPS Broadcast";
    btn.style.background = "#10b981";
  }
}
