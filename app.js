// ========================================
// 🏍️ BIKE TRIP TRACKER
// ========================================

let map;
let myMarker;
let startMarker;
let destinationMarker;

let currentPosition = null;


// ========================================
// PAGE LOAD
// ========================================

document.addEventListener("DOMContentLoaded", () => {

  const startTripBtn =
    document.getElementById("startTripBtn");

  const gpsSetupBtn =
    document.getElementById("gpsSetupBtn");

  const locationBtn =
    document.getElementById("locationBtn");


  // -----------------------------
  // START TRIP
  // -----------------------------

  startTripBtn.addEventListener("click", startTrip);


  // -----------------------------
  // USE GPS FROM SETUP
  // -----------------------------

  gpsSetupBtn.addEventListener(
    "click",
    getCurrentLocationForSetup
  );


  // -----------------------------
  // MY LOCATION BUTTON
  // -----------------------------

  locationBtn.addEventListener(
    "click",
    locateMe
  );


  // -----------------------------
  // CHAT
  // -----------------------------

  document
    .getElementById("chatBtn")
    .addEventListener("click", () => {

      alert(
        "💬 Group Chat\n\n" +
        "Chat feature next step me add karenge."
      );

    });


  // -----------------------------
  // CALL
  // -----------------------------

  document
    .getElementById("callBtn")
    .addEventListener("click", () => {

      alert(
        "📞 Calling\n\n" +
        "Voice/Video calling next step me WebRTC se add hogi."
      );

    });


  console.log(
    "🏍️ Bike Trip Tracker loaded!"
  );

});


// ========================================
// START TRIP
// ========================================

function startTrip() {

  const name =
    document
      .getElementById("riderName")
      .value
      .trim();

  const startLocation =
    document
      .getElementById("startLocation")
      .value
      .trim();

  const destination =
    document
      .getElementById("destination")
      .value
      .trim();


  // -----------------------------
  // VALIDATION
  // -----------------------------

  if (!name) {

    alert("👤 Apna naam enter karo.");

    return;
  }


  if (!startLocation) {

    alert(
      "📍 Starting location enter karo.\n\n" +
      "Example: Raipur"
    );

    return;
  }


  if (!destination) {

    alert(
      "🏁 Destination enter karo.\n\n" +
      "Example: Kathmandu"
    );

    return;
  }


  // -----------------------------
  // SAVE BASIC DATA
  // -----------------------------

  localStorage.setItem(
    "riderName",
    name
  );

  localStorage.setItem(
    "startLocation",
    startLocation
  );

  localStorage.setItem(
    "destination",
    destination
  );


  // -----------------------------
  // SHOW APP
  // -----------------------------

  document
    .getElementById("setupScreen")
    .classList.add("hidden");

  document
    .getElementById("appScreen")
    .classList.remove("hidden");


  // -----------------------------
  // TRIP INFO
  // -----------------------------

  document
    .getElementById("tripInfo")
    .innerText =
      startLocation +
      " → " +
      destination;


  // -----------------------------
  // ADD RIDER
  // -----------------------------

  addMyRider(name);


  // -----------------------------
  // CREATE MAP
  // -----------------------------

  createMap();


  // -----------------------------
  // FIND LOCATIONS
  // -----------------------------

  findLocation(
    startLocation,
    "start"
  );

  findLocation(
    destination,
    "destination"
  );


  // -----------------------------
  // GET CURRENT GPS
  // -----------------------------

  getCurrentLocation();

}


// ========================================
// CREATE MAP
// ========================================

function createMap() {

  // Default location
  // India center

  map = L.map("map").setView(
    [22.5937, 78.9629],
    5
  );


  // OpenStreetMap tiles

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,

      attribution:
        '&copy; OpenStreetMap contributors'
    }
  ).addTo(map);


  console.log("🗺️ Map created");

}


// ========================================
// SEARCH LOCATION
// ========================================

async function findLocation(
  locationName,
  type
) {

  try {

    const url =
      "https://nominatim.openstreetmap.org/search" +
      "?format=json" +
      "&limit=1" +
      "&q=" +
      encodeURIComponent(locationName);


    const response =
      await fetch(url);


    const data =
      await response.json();


    if (!data || data.length === 0) {

      alert(
        "Location nahi mili: " +
        locationName
      );

      return;
    }


    const latitude =
      parseFloat(data[0].lat);

    const longitude =
      parseFloat(data[0].lon);


    // -----------------------------
    // START LOCATION
    // -----------------------------

    if (type === "start") {

      if (startMarker) {
        map.removeLayer(startMarker);
      }


      startMarker =
        L.marker([
          latitude,
          longitude
        ])
        .addTo(map)
        .bindPopup(
          "📍 Starting Point<br>" +
          "<b>" +
          locationName +
          "</b>"
        );


      startMarker.openPopup();


      map.setView(
        [latitude, longitude],
        10
      );

    }


    // -----------------------------
    // DESTINATION
    // -----------------------------

    if (type === "destination") {

      if (destinationMarker) {
        map.removeLayer(
          destinationMarker
        );
      }


      destinationMarker =
        L.marker([
          latitude,
          longitude
        ])
        .addTo(map)
        .bindPopup(
          "🏁 Destination<br>" +
          "<b>" +
          locationName +
          "</b>"
        );

    }


    // -----------------------------
    // FIT BOTH LOCATIONS
    // -----------------------------

    if (
      startMarker &&
      destinationMarker
    ) {

      const group =
        L.featureGroup([
          startMarker,
          destinationMarker
        ]);


      map.fitBounds(
        group.getBounds(),
        {
          padding: [30, 30]
        }
      );

    }

  }

  catch (error) {

    console.error(
      "Location search error:",
      error
    );

    alert(
      "Location search nahi ho paaya."
    );

  }

}


// ========================================
// GET GPS
// ========================================

function getCurrentLocation() {

  if (!navigator.geolocation) {

    alert(
      "Aapke browser me GPS support nahi hai."
    );

    return;
  }


  navigator.geolocation.getCurrentPosition(

    position => {

      const latitude =
        position.coords.latitude;

      const longitude =
        position.coords.longitude;


      currentPosition = {
        latitude,
        longitude
      };


      showMyLocation(
        latitude,
        longitude
      );

    },


    error => {

      console.log(
        "GPS Error:",
        error
      );

      alert(
        "📍 GPS permission allow karo."
      );

    },


    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }

  );

}


// ========================================
// GPS FROM SETUP SCREEN
// ========================================

function getCurrentLocationForSetup() {

  const button =
    document.getElementById(
      "gpsSetupBtn"
    );


  button.innerText =
    "📍 Getting location...";


  if (!navigator.geolocation) {

    alert(
      "GPS supported nahi hai."
    );

    button.innerText =
      "📍 Use My Current Location";

    return;
  }


  navigator.geolocation.getCurrentPosition(

    async position => {

      const latitude =
        position.coords.latitude;

      const longitude =
        position.coords.longitude;


      try {

        const response =
          await fetch(
            "https://nominatim.openstreetmap.org/reverse" +
            "?format=json" +
            "&lat=" +
            latitude +
            "&lon=" +
            longitude
          );


        const data =
          await response.json();


        const location =
          data.display_name ||
          (
            latitude.toFixed(5) +
            ", " +
            longitude.toFixed(5)
          );


        document
          .getElementById(
            "startLocation"
          )
          .value = location;


        button.innerText =
          "✅ Current Location Added";

      }

      catch (error) {

        document
          .getElementById(
            "startLocation"
          )
          .value =
            latitude.toFixed(5) +
            ", " +
            longitude.toFixed(5);


        button.innerText =
          "✅ Location Added";

      }

    },


    error => {

      console.log(error);

      button.innerText =
        "📍 Use My Current Location";


      alert(
        "GPS permission allow karo."
      );

    },


    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }

  );

}


// ========================================
// SHOW MY GPS MARKER
// ========================================

function showMyLocation(
  latitude,
  longitude
) {

  if (!map) {
    return;
  }


  // Remove old marker

  if (myMarker) {

    map.removeLayer(
      myMarker
    );

  }


  // Create marker

  myMarker =
    L.marker([
      latitude,
      longitude
    ])
    .addTo(map)
    .bindPopup(
      "🏍️ <b>YOU</b><br>" +
      "📍 Current Location"
    );


  myMarker.openPopup();


  // Move map

  map.setView(
    [
      latitude,
      longitude
    ],
    15
  );


  console.log(
    "📍 Current GPS:",
    latitude,
    longitude
  );

}


// ========================================
// MY LOCATION BUTTON
// ========================================

function locateMe() {

  const button =
    document.getElementById(
      "locationBtn"
    );


  button.innerText =
    "📍 Locating...";


  if (!navigator.geolocation) {

    alert(
      "GPS supported nahi hai."
    );

    button.innerText =
      "📍 My Location";

    return;
  }


  navigator.geolocation.getCurrentPosition(

    position => {

      const latitude =
        position.coords.latitude;

      const longitude =
        position.coords.longitude;


      showMyLocation(
        latitude,
        longitude
      );


      button.innerText =
        "✅ My Location";

    },


    error => {

      console.log(error);

      button.innerText =
        "📍 My Location";


      alert(
        "Location permission allow karo."
      );

    },


    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }

  );

}


// ========================================
// ADD MY RIDER
// ========================================

function addMyRider(name) {

  const riderList =
    document.getElementById(
      "riderList"
    );


  riderList.innerHTML = "";


  const rider =
    document.createElement(
      "div"
    );


  rider.className =
    "rider";


  rider.innerHTML = `

    <div class="rider-icon">
      🏍️
    </div>

    <div class="rider-info">

      <strong>
        ${escapeHTML(name)}
      </strong>

      <small>
        🟢 Online • You
      </small>

    </div>

    <button
      class="call-btn"
      onclick="alert('📞 Calling feature next step me aayega.')"
    >
      📞
    </button>

  `;


  riderList.appendChild(
    rider
  );


  document
    .getElementById(
      "riderCount"
    )
    .innerText = "1";


  document
    .getElementById(
      "memberCount"
    )
    .innerText = "1";

}


// ========================================
// SECURITY
// ========================================

function escapeHTML(text) {

  const div =
    document.createElement(
      "div"
    );

  div.textContent = text;

  return div.innerHTML;

}
