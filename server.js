const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const activeRiders = {};

io.on('connection', (socket) => {
  console.log(`Rider connected: ${socket.id}`);

  // 1. Join Telemetry & Voice Room
  socket.on('join-room', ({ riderId }) => {
    socket.riderId = riderId;
    activeRiders[socket.id] = { socketId: socket.id, riderId, lat: 0, lng: 0, speed: 0, distance: 0 };
    
    socket.join('protrack-room');
    
    // Notify room of existing users for WebRTC Mesh connection
    const otherUsers = Array.from(io.sockets.adapter.rooms.get('protrack-room') || [])
      .filter(id => id !== socket.id)
      .map(id => ({ socketId: id, riderId: activeRiders[id]?.riderId }));
      
    socket.emit('all-users', otherUsers);
    io.to('protrack-room').emit('riders-update', Object.values(activeRiders));
  });

  // 2. WebRTC Peer-to-Peer Signaling Handshake
  socket.on('sending-signal', (payload) => {
    io.to(payload.userToSignal).emit('user-joined-signal', {
      signal: payload.signal,
      callerID: payload.callerID,
      riderId: socket.riderId
    });
  });

  socket.on('returning-signal', (payload) => {
    io.to(payload.callerID).emit('receiving-returned-signal', {
      signal: payload.signal,
      id: socket.id
    });
  });

  socket.on('ice-candidate', (payload) => {
    io.to(payload.target).emit('ice-candidate', {
      candidate: payload.candidate,
      from: socket.id
    });
  });

  // 3. Live GPS Telemetry Broadcast
  socket.on('update-location', (data) => {
    if (activeRiders[socket.id]) {
      activeRiders[socket.id] = { ...activeRiders[socket.id], ...data };
      io.to('protrack-room').emit('riders-update', Object.values(activeRiders));
    }
  });

  // 4. Group Chat Broadcast
  socket.on('send-message', (data) => {
    io.to('protrack-room').emit('receive-message', {
      sender: socket.riderId,
      message: data.message,
      timestamp: Date.now()
    });
  });

  // 5. Handle Disconnects
  socket.on('disconnect', () => {
    delete activeRiders[socket.id];
    io.to('protrack-room').emit('user-disconnected', socket.id);
    io.to('protrack-room').emit('riders-update', Object.values(activeRiders));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`ProTrack WebRTC Server running on port ${PORT}`));
