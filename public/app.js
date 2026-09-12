// 1. Firebase Initialization with your DB URL
const firebaseConfig = {
  databaseURL: "https://full-stack-web-3ee1c-default-rtdb.firebaseio.com/"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const socket = io();
let localStream = null;
const peers = {}; // Peer connections: { socketId: RTCPeerConnection }
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

// Select initial rider
currentRiderId = document.getElementById('riderSelect').value;
socket.emit('join-room', { riderId: currentRiderId });

function switchUser() {
  currentRiderId = document.getElementById('riderSelect').value;
  socket.emit('join-room', { riderId: currentRiderId });
}

// 2. WebRTC Voice Engine
async function toggleVoice() {
  const btn = document.getElementById('voiceBtn');
  const status = document.getElementById('voiceStatus');

  if (!isVoiceActive) {
    try {
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

      socket.emit('join-room', { riderId: currentRiderId });

      // Save voice state to Firebase
      db.ref("voice_room/" + currentRiderId).set({
        active: true,
        updatedAt: Date.now()
      });

    } catch (err) {
      alert("Microphone Permission Denied! Browser site settings me jaakar Mic allow karein.");
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

  // Remove voice state from Firebase
  db.ref("voice_room/" + currentRiderId).remove();
}

// 3. Signaling Protocols
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

// 4. Firebase Group Chat Integration
function sendChat() {
  const input = document.getElementById('chatMsg');
  const msg = input.value.trim();
  if (!msg) return;

  db.ref("group_chats").push({
    sender: currentRiderId.replace('_', ' '),
    riderId: currentRiderId,
    message: msg,
    timestamp: Date.now()
  });

  input.value = "";
}

// Listen to messages from Firebase
db.ref("group_chats").limitToLast(30).on("child_added", (snapshot) => {
  const data = snapshot.val();
  const logs = document.getElementById('chatLogs');
  const div = document.createElement('div');
  div.className = "msg";
  div.innerHTML = `<strong>${data.sender}:</strong> ${data.message}`;
  logs.appendChild(div);
  logs.scrollTop = logs.scrollHeight;
});

// 5. GPS Telemetry tracking with Firebase Realtime Database
function toggleTracking() {
  const btn = document.getElementById('trackBtn');
  if (!isTracking) {
    isTracking = true;
    btn.innerText = "Stop GPS Broadcast";
    btn.style.background = "#ef4444";
    watchId = navigator.geolocation.watchPosition((pos) => {
      const spd = pos.coords.speed ? (pos.coords.speed * 3.6).toFixed(1) : 0;
      document.getElementById('speedVal').innerText = `${spd} km/h`;
      
      const payload = { 
        lat: pos.coords.latitude, 
        lng: pos.coords.longitude, 
        speed: spd,
        updatedAt: Date.now() 
      };

      socket.emit('update-location', payload);

      // Save live location to Firebase
      db.ref("riders/" + currentRiderId).set(payload);

    }, null, { enableHighAccuracy: true });
  } else {
    isTracking = false;
    navigator.geolocation.clearWatch(watchId);
    btn.innerText = "Start GPS Broadcast";
    btn.style.background = "#10b981";
  }
}
