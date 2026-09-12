
// ================================
// Nepal Ride Tracker - app.js
// ================================

document.addEventListener("DOMContentLoaded", () => {

  // -------------------------------
  // My Location Button
  // -------------------------------

  const locationBtn = document.getElementById("locationBtn");

  locationBtn.addEventListener("click", () => {

    if (!navigator.geolocation) {
      alert("Aapke browser me GPS support nahi hai.");
      return;
    }

    locationBtn.innerText = "📍 Locating...";

    navigator.geolocation.getCurrentPosition(
      (position) => {

        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        console.log("Latitude:", latitude);
        console.log("Longitude:", longitude);

        locationBtn.innerText = "✅ Location Found";

        alert(
          "📍 Aapki location mil gayi!\n\n" +
          "Latitude: " + latitude.toFixed(6) +
          "\nLongitude: " + longitude.toFixed(6)
        );

      },

      (error) => {

        console.log(error);

        locationBtn.innerText = "📍 My Location";

        if (error.code === 1) {
          alert("Location permission allow karo.");
        } else {
          alert("Location nahi mil paayi.");
        }

      },

      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

  });


  // -------------------------------
  // Chat Button
  // -------------------------------

  const chatBtn = document.getElementById("chatBtn");

  chatBtn.addEventListener("click", () => {

    alert(
      "💬 Group Chat\n\n" +
      "Chat feature next step me connect hoga."
    );

  });


  // -------------------------------
  // Call Button
  // -------------------------------

  const callBtn = document.getElementById("callBtn");

  callBtn.addEventListener("click", () => {

    alert(
      "📞 Calls\n\n" +
      "Voice/Video calling WebRTC se next step me add karenge."
    );

  });


  // -------------------------------
  // Rider Call Buttons
  // -------------------------------

  const riderCallButtons =
    document.querySelectorAll(".call-btn");

  riderCallButtons.forEach((button) => {

    button.addEventListener("click", () => {

      const rider =
        button.parentElement
          .querySelector(".rider-info strong")
          .innerText;

      alert(
        "📞 Calling " + rider + "...\n\n" +
        "Real calling WebRTC se connect hogi."
      );

    });

  });


  // -------------------------------
  // Bike Click
  // -------------------------------

  const bikes =
    document.querySelectorAll(".bike");

  bikes.forEach((bike) => {

    bike.addEventListener("click", () => {

      const riderName = bike.getAttribute("title");

      alert(
        "🏍️ " + riderName +
        "\n\n🟢 Online\n📍 Live tracking active"
      );

    });

  });


  // -------------------------------
  // YOUR BIKE
  // -------------------------------

  const myBike =
    document.querySelector(".my-bike");

  myBike.addEventListener("click", () => {

    alert(
      "🏍️ YOU\n\n" +
      "🟢 Online\n" +
      "📍 GPS tracking ready"
    );

  });


  // -------------------------------
  // Welcome Message
  // -------------------------------

  console.log(
    "🇳🇵 Nepal Ride Tracker loaded successfully!"
  );

});
