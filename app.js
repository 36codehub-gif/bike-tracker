// Firebase Setup
const firebaseConfig = {
  databaseURL: "https://full-stack-web-3ee1c-default-rtdb.firebaseio.com/"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let map, tileLayer;
let isDarkMode = true;
let isTracking = false;
let watchId = null;
let currentRiderId = "Ajay_Patel";
let timerInterval = null;
let secondsElapsed = 0;

let lastLat = null, lastLng = null;
let totalDistance = 0, topSpeed = 0;

const markers = {};
const polylines = {};
const routes = {};
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

window.onload = () => {
  map = L.map('map', { zoomControl: false }).setView([20.5937, 78.9629], 5);
  
  tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(map);

  currentRiderId = document.getElementById('riderSelect').value;
  listenToFirebase();
  listenToSOS();
};

function toggleMapTheme() {
  map.removeLayer(tileLayer);
  if (isDarkMode) {
    tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    document.getElementById('themeIcon').className = "fa-solid fa-sun";
    isDarkMode = false;
  } else {
    tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
    document.getElementById('themeIcon').className = "fa-solid fa-moon";
    isDarkMode = true;
  }
}

function getMarkerIcon(color) {
  return L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="background:${color}; width:18px; height:18px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 12px ${color};"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
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

// REALTIME DATABASE ENGINE & GAP ANALYZER
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

      if (!routes[riderId]) routes[riderId] = [];
      routes[riderId].push([rider.lat, rider.lng]);

      if (polylines[riderId]) {
        polylines[riderId].setLatLngs(routes[riderId]);
      } else {
        polylines[riderId] = L.polyline(routes[riderId], { color: color, weight: 4, opacity: 0.8 }).addTo(map);
      }

      const popupContent = `<b>🚴 ${name}</b><br>Speed: ${rider.speed || 0} km/h<br>Distance: ${rider.distance || 0} KM`;
      
      if (markers[riderId]) {
        markers[riderId].setLatLng([rider.lat, rider.lng]);
        markers[riderId].setPopupContent(popupContent);
      } else {
        markers[riderId] = L.marker([rider.lat, rider.lng], { icon: getMarkerIcon(color) })
          .addTo(map)
          .bindPopup(popupContent);
      }
    });

    updateGapMetrics();
    updateLeaderboardUI();
  });
}

// GAP CALCULATOR (Kaun kitna KM pichhe hai)
function updateGapMetrics() {
  const ridersArray = Object.keys(riderDataCache).map(id => ({
    id,
    dist: parseFloat(riderDataCache[id].distance || 0)
  })).sort((a, b) => b.dist - a.dist);

  if (ridersArray.length === 0) return;

  const leader = ridersArray[0];
  const myIndex = ridersArray.findIndex(r => r.id === currentRiderId);
  const myDist = riderDataCache[currentRiderId] ? parseFloat(riderDataCache[currentRiderId].distance || 0) : 0;

  // Gap to Leader
  if (myIndex === 0) {
    document.getElementById('gapToLeader').innerText = "🏆 Rank #1 (Leader)";
    document.getElementById('gapToLeader').style.color = "#10b981";
  } else {
    const gapLeader = (leader.dist - myDist).toFixed(2);
    document.getElementById('gapToLeader').innerText = `-${gapLeader} KM`;
    document.getElementById('gapToLeader').style.color = "#f59e0b";
  }

  // Gap to Next Rider Ahead
  if (myIndex > 0) {
    const nextRider = ridersArray[myIndex - 1];
    const gapNext = (nextRider.dist - myDist).toFixed(2);
    const nextName = nextRider.id.replace('_', ' ');
    document.getElementById('gapToNext').innerText = `-${gapNext} KM (${nextName})`;
  } else {
    document.getElementById('gapToNext').innerText = "Top Rider";
  }
}

// RIDER PROFILE CLICK -> ZOOM TO LOCATION
function locateRider(riderId) {
  if (riderDataCache[riderId]) {
    const { lat, lng } = riderDataCache[riderId];
    toggleLeaderboard(); // Close Modal
    map.flyTo([lat, lng], 17, { animate: true, duration: 1.5 });
    if (markers[riderId]) {
      markers[riderId].openPopup();
    }
  } else {
    alert("Is rider ki GPS Location abhi available nahi hai!");
  }
}

// LEADERBOARD UI WITH TICK/CLICK FUNCTION
function updateLeaderboardUI() {
  const list = document.getElementById('leaderboardList');
  if (!list) return;

  const sorted = Object.keys(riderDataCache).map(id => ({
    id,
    ...riderDataCache[id],
    distNum: parseFloat(riderDataCache[id].distance || 0)
  })).sort((a, b) => b.distNum - a.distNum);

  const topDist = sorted.length > 0 ? sorted[0].distNum : 0;

  list.innerHTML = sorted.map((r, idx) => {
    const gap = (topDist - r.distNum).toFixed(2);
    const gapText = idx === 0 ? "🏆 Leader" : `-${gap} KM behind #1`;
    const color = riderColors[r.id] || "#fff";

    return `
      <div class="rider-item-card" onclick="locateRider('${r.id}')">
        <div class="rider-rank">#${idx + 1}</div>
        <div class="rider-info">
          <div class="rider-name" style="color:${color};"><i class="fa-solid fa-location-dot"></i> ${r.id.replace('_', ' ')}</div>
          <div class="rider-gap-info">${gapText}</div>
        </div>
        <div class="rider-metrics">
          <div class="rider-dist">${r.distance || '0.00'} KM</div>
          <div class="rider-speed">⚡ ${r.speed || 0} km/h</div>
        </div>
      </div>
    `;
  }).join('');
}

// GPS Tracking Toggle
function toggleTracking() {
  const btn = document.getElementById('startBtn');
  const status = document.getElementById('appStatus');

  if (!isTracking) {
    if (!navigator.geolocation) return alert("GPS Support Nahi Hai!");

    isTracking = true;
    btn.innerHTML = `<i class="fa-solid fa-pause"></i> Pause`;
    btn.style.background = "#f59e0b";
    status.innerHTML = `<i class="fa-solid fa-circle" style="color:#10b981;"></i> Live`;

    startTimer();

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
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

        lastLat = latitude;
        lastLng = longitude;

        document.getElementById('liveSpeed').innerHTML = `${currentSpeed} <small>km/h</small>`;
        document.getElementById('liveDistance').innerHTML = `${totalDistance.toFixed(2)} <small>KM</small>`;

        db.ref("riders/" + currentRiderId).set({
          lat: latitude,
          lng: longitude,
          speed: currentSpeed,
          distance: totalDistance.toFixed(2),
          updatedAt: Date.now()
        });
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
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

function handleRiderChange() {
  currentRiderId = document.getElementById('riderSelect').value;
  focusCurrentRider();
  updateGapMetrics();
}

function focusCurrentRider() {
  if (riderDataCache[currentRiderId]) {
    const { lat, lng } = riderDataCache[currentRiderId];
    map.flyTo([lat, lng], 17, { animate: true });
  }
}

function triggerSOS() {
  db.ref("sos_event").set({
    rider: currentRiderId.replace('_', ' '),
    time: Date.now(),
    active: true
  });
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

function dismissSOS() {
  document.getElementById('sosBanner').style.display = "none";
}

function toggleLeaderboard() {
  const modal = document.getElementById('leaderboardModal');
  modal.style.display = (modal.style.display === "block") ? "none" : "block";
}
