// Firebase Config
const firebaseConfig = {
  databaseURL: "https://full-stack-web-3ee1c-default-rtdb.firebaseio.com/"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let map;
let isTracking = false;
let watchId = null;
let currentRiderId = "Ajay_Patel";
let timerInterval = null;
let secondsElapsed = 0;

let lastLat = null, lastLng = null;
let totalDistance = 0, topSpeed = 0;

// WebRTC Voice Call Variables
let localStream = null;
let peerConnections = {};
let isAudioMuted = false;
let inVoiceCall = false;
let unreadChatCount = 0;

const markers = {};
const polylines = {};
const routes = {};
const infoWindows = {};
const riderDataCache = {};

const riderColors = {
  "Ajay_Patel": "#ef4444",
  "Arvind_Kewat": "#3b82f6",
  "Baldev_Patel": "#10b981",
  "Chaitan_Maitry": "#f59e0b",
  "Sachin_Maitry": "#a855f7",
  "Sanjay_Kumar": "#ec4899",
  "Shiv_Patel": "#06b6d4"
};

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

// 1. Initialize Map & Listeners
function initMap() {
  const center = { lat: 20.5937, lng: 78.9629 };
  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 5, center, disableDefaultUI: true, mapTypeId: google.maps.MapTypeId.ROADMAP
  });

  currentRiderId = document.getElementById('riderSelect').value;
  listenToFirebase();
  listenToChat();
  listenToSOS();
}

function toggleMapType() {
  map.setMapTypeId(map.getMapTypeId() === 'roadmap' ? 'hybrid' : 'roadmap');
}

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

// 2. Realtime Location Syncing
function listenToFirebase() {
  db.ref("riders").on("value", (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    Object.keys(data).forEach(riderId => {
      const rider = data[riderId];
      if (!rider.lat || !rider.lng) return;

      riderDataCache[riderId] = rider;
      const color = riderColors[riderId] || "#ffffff";
      const name = riderId.replace('_', ' ');
      const pos = { lat: parseFloat(rider.lat), lng: parseFloat(rider.lng) };

      if (!routes[riderId]) routes[riderId] = [];
      routes[riderId].push(pos);

      if (polylines[riderId]) {
        polylines[riderId].setPath(routes[riderId]);
      } else {
        polylines[riderId] = new google.maps.Polyline({
          path: routes[riderId], geodesic: true, strokeColor: color, strokeOpacity: 0.8, strokeWeight: 4, map: map
        });
      }

      const content = `<div style="color:#000;"><strong>🚴 ${name}</strong><br>Speed: ${rider.speed || 0} km/h<br>Dist: ${rider.distance || 0} KM</div>`;

      if (markers[riderId]) {
        markers[riderId].setPosition(pos);
        infoWindows[riderId].setContent(content);
      } else {
        infoWindows[riderId] = new google.maps.InfoWindow({ content });
        markers[riderId] = new google.maps.Marker({
          position: pos, map: map, title: name,
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: color, fillOpacity: 1, strokeWeight: 2, strokeColor: "#fff" }
        });
        markers[riderId].addListener("click", () => infoWindows[riderId].open(map, markers[riderId]));
      }
    });

    updateGapMetrics();
    updateLeaderboardUI();
  });
}

// 3. WebRTC Audio Call Engine (Volume & Audio Fix)
async function toggleVoiceCall() {
  if (!inVoiceCall) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, 
        video: false 
      });

      inVoiceCall = true;
      document.getElementById('voiceCallBtn').classList.add('active');
      document.getElementById('voiceCallBtn').innerHTML = `<i class="fa-solid fa-microphone"></i>`;
      document.getElementById('voiceChannelBar').style.display = "flex";
      document.getElementById('voiceStatusText').innerText = "Live Voice Channel Connected";

      db.ref("voice_room/" + currentRiderId).set({ active: true, riderName: currentRiderId.replace('_', ' '), time: Date.now() });

      listenToOtherVoiceRiders();

    } catch (err) {
      alert("Microphone Permission Alert: Chrome/Safari App Settings me jaakar Mic Permission Allow karein!");
    }
  } else {
    leaveVoiceChannel();
  }
}

function listenToOtherVoiceRiders() {
  db.ref("voice_room").on("child_added", (snapshot) => {
    const riderId = snapshot.key;
    if (riderId !== currentRiderId) {
      createRemoteAudioPlayer(riderId);
    }
  });

  db.ref("voice_room").on("child_removed", (snapshot) => {
    const riderId = snapshot.key;
    const player = document.getElementById("audio_" + riderId);
    if (player) player.remove();
  });
}

function createRemoteAudioPlayer(riderId) {
  let audioElement = document.getElementById("audio_" + riderId);
  if (!audioElement) {
    audioElement = document.createElement("audio");
    audioElement.id = "audio_" + riderId;
    audioElement.autoplay = true;
    audioElement.controls = false;
    document.body.appendChild(audioElement);
  }
}

function toggleMute() {
  if (!localStream) return;
  isAudioMuted = !isAudioMuted;
  localStream.getAudioTracks()[0].enabled = !isAudioMuted;
  const btn = document.getElementById('muteBtn');
  btn.innerHTML = isAudioMuted ? `<i class="fa-solid fa-microphone-slash"></i>` : `<i class="fa-solid fa-microphone"></i>`;
}

function leaveVoiceChannel() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  inVoiceCall = false;
  document.getElementById('voiceCallBtn').classList.remove('active');
  document.getElementById('voiceCallBtn').innerHTML = `<i class="fa-solid fa-microphone-slash"></i>`;
  document.getElementById('voiceChannelBar').style.display = "none";
  db.ref("voice_room/" + currentRiderId).remove();
}

// 4. Group Chat Engine
function sendChatMessage() {
  const input = document.getElementById('chatInput');
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

function handleChatKeyPress(e) {
  if (e.key === 'Enter') sendChatMessage();
}

function listenToChat() {
  db.ref("group_chats").limitToLast(50).on("child_added", (snapshot) => {
    const data = snapshot.val();
    const chatContainer = document.getElementById('chatMessages');
    const isSelf = data.riderId === currentRiderId;
    const timeStr = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const msgHtml = `
      <div class="chat-msg ${isSelf ? 'self' : ''}">
        <div class="msg-author">${data.sender}</div>
        <div class="msg-text">${data.message}</div>
        <div class="msg-time">${timeStr}</div>
      </div>
    `;

    chatContainer.innerHTML += msgHtml;
    chatContainer.scrollTop = chatContainer.scrollHeight;

    const modal = document.getElementById('chatModal');
    if (modal.style.display !== "block" && !isSelf) {
      unreadChatCount++;
      const badge = document.getElementById('chatBadge');
      badge.innerText = unreadChatCount;
      badge.style.display = "block";
    }
  });
}

function toggleChatModal() {
  const modal = document.getElementById('chatModal');
  const isOpening = modal.style.display !== "block";
  modal.style.display = isOpening ? "block" : "none";

  if (isOpening) {
    unreadChatCount = 0;
    document.getElementById('chatBadge').style.display = "none";
    const chatContainer = document.getElementById('chatMessages');
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

// 5. GPS Tracking & Analytics
function toggleTracking() {
  const btn = document.getElementById('startBtn');
  const status = document.getElementById('appStatus');

  if (!isTracking) {
    if (!navigator.geolocation) return alert("GPS is not supported on this device!");
    isTracking = true;
    btn.innerHTML = `<i class="fa-solid fa-pause"></i> Pause`;
    btn.style.background = "#f59e0b";
    status.innerHTML = `<i class="fa-solid fa-circle" style="color:#10b981;"></i> Live`;
    startTimer();

    watchId = navigator.geolocation.watchPosition((pos) => {
      const { latitude, longitude, speed } = pos.coords;
      const currentSpeed = speed ? (speed * 3.6).toFixed(1) : 0;

      if (currentSpeed > topSpeed) {
        topSpeed = currentSpeed;
        document.getElementById('maxSpeed').innerHTML = `${topSpeed} <small>km/h</small>`;
      }

      if (lastLat !== null && lastLng !== null) {
        const d = calcDistance(lastLat, lastLng, latitude, longitude);
        if (d > 0.003) totalDistance += d;
      }

      lastLat = latitude; lastLng = longitude;
      document.getElementById('liveSpeed').innerHTML = `${currentSpeed} <small>km/h</small>`;
      document.getElementById('liveDistance').innerHTML = `${totalDistance.toFixed(2)} <small>KM</small>`;

      db.ref("riders/" + currentRiderId).set({
        lat: latitude, lng: longitude, speed: currentSpeed, distance: totalDistance.toFixed(2), updatedAt: Date.now()
      });
    }, (err) => console.error(err), { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 });
  } else {
    isTracking = false;
    navigator.geolocation.clearWatch(watchId);
    clearInterval(timerInterval);
    btn.innerHTML = `<i class="fa-solid fa-play"></i> Resume`;
    btn.style.background = "#10b981";
    status.innerHTML = `<i class="fa-solid fa-circle" style="color:#f59e0b;"></i> Paused`;
  }
}

function startTimer() {
  timerInterval = setInterval(() => {
    secondsElapsed++;
    const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, '0');
    const secs = String(secondsElapsed % 60).padStart(2, '0');
    document.getElementById('rideTime').innerText = `${mins}:${secs}`;
  }, 1000);
}

function updateGapMetrics() {
  const sorted = Object.keys(riderDataCache).map(id => ({
    id, dist: parseFloat(riderDataCache[id].distance || 0)
  })).sort((a, b) => b.dist - a.dist);

  if (sorted.length === 0) return;

  const leader = sorted[0];
  const myIndex = sorted.findIndex(r => r.id === currentRiderId);
  const myDist = riderDataCache[currentRiderId] ? parseFloat(riderDataCache[currentRiderId].distance || 0) : 0;

  if (myIndex === 0) {
    document.getElementById('gapToLeader').innerText = "🏆 Rank #1 (Leader)";
    document.getElementById('gapToLeader').style.color = "#10b981";
  } else {
    document.getElementById('gapToLeader').innerText = `-${(leader.dist - myDist).toFixed(2)} KM`;
    document.getElementById('gapToLeader').style.color = "#f59e0b";
  }

  if (myIndex > 0) {
    const nextRider = sorted[myIndex - 1];
    document.getElementById('gapToNext').innerText = `-${(nextRider.dist - myDist).toFixed(2)} KM (${nextRider.id.replace('_', ' ')})`;
  } else {
    document.getElementById('gapToNext').innerText = "Top Rider";
  }
}

function updateLeaderboardUI() {
  const list = document.getElementById('leaderboardList');
  if (!list) return;

  const sorted = Object.keys(riderDataCache).map(id => ({
    id, ...riderDataCache[id], distNum: parseFloat(riderDataCache[id].distance || 0)
  })).sort((a, b) => b.distNum - a.distNum);

  const topDist = sorted.length > 0 ? sorted[0].distNum : 0;

  list.innerHTML = sorted.map((r, idx) => `
    <div class="rider-item-card" onclick="locateRider('${r.id}')">
      <div class="rider-rank">#${idx + 1}</div>
      <div class="rider-info">
        <div class="rider-name" style="color:${riderColors[r.id]};"><i class="fa-solid fa-location-dot"></i> ${r.id.replace('_', ' ')}</div>
        <div class="rider-gap-info">${idx === 0 ? "🏆 Leader" : `-${(topDist - r.distNum).toFixed(2)} KM behind #1`}</div>
      </div>
      <div class="rider-metrics">
        <div class="rider-dist">${r.distance || '0.00'} KM</div>
        <div class="rider-speed">⚡ ${r.speed || 0} km/h</div>
      </div>
    </div>
  `).join('');
}

function locateRider(riderId) {
  if (riderDataCache[riderId]) {
    const { lat, lng } = riderDataCache[riderId];
    toggleLeaderboard();
    map.panTo({ lat: parseFloat(lat), lng: parseFloat(lng) });
    map.setZoom(17);
    if (markers[riderId] && infoWindows[riderId]) infoWindows[riderId].open(map, markers[riderId]);
  }
}

function handleRiderChange() {
  currentRiderId = document.getElementById('riderSelect').value;
  focusCurrentRider();
  updateGapMetrics();
}

function focusCurrentRider() {
  if (riderDataCache[currentRiderId]) {
    const { lat, lng } = riderDataCache[currentRiderId];
    map.panTo({ lat: parseFloat(lat), lng: parseFloat(lng) });
    map.setZoom(17);
  }
}

function triggerSOS() {
  db.ref("sos_event").set({ rider: currentRiderId.replace('_', ' '), time: Date.now(), active: true });
}

function listenToSOS() {
  db.ref("sos_event").on("value", (snap) => {
    const data = snap.val();
    if (data && data.active) {
      document.getElementById('sosRiderName').innerText = data.rider;
      document.getElementById('sosBanner').style.display = "flex";
    }
  });
}

function dismissSOS() { document.getElementById('sosBanner').style.display = "none"; }
function toggleLeaderboard() {
  const modal = document.getElementById('leaderboardModal');
  modal.style.display = (modal.style.display === "block") ? "none" : "block";
}
