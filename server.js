const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Active Session Registry
const activeSession = new Map();

io.on('connection', (socket) => {
  
  socket.on('join-room', ({ riderId }) => {
    socket.riderId = riderId;
    activeSession.set(socket.id, {
      socketId: socket.id,
      riderId: riderId,
      joinedAt: Date.now()
    });

    socket.join('protrack-enterprise-room');

    // Retrieve peers currently active in the room
    const peersInRoom = Array.from(io.sockets.adapter.rooms.get('protrack-enterprise-room') || [])
      .filter(id => id !== socket.id)
      .map(id => ({
        socketId: id,
        riderId: activeSession.get(id)?.riderId
      }));

    // Send existing peers to the new joiner
    socket.emit('room-peers', peersInRoom);
    
    // Broadcast updated active session registry
    io.to('protrack-enterprise-room').emit('registry-update', Array.from(activeSession.values()));
  });

  // WebRTC Signaling Protocol Exchange
  socket.on('signal-offer', ({ targetSocketId, offer }) => {
    io.to(targetSocketId).emit('signal-offer', {
      callerSocketId: socket.id,
      riderId: socket.riderId,
      offer: offer
    });
  });

  socket.on('signal-answer', ({ targetSocketId, answer }) => {
    io.to(targetSocketId).emit('signal-answer', {
      responderSocketId: socket.id,
      answer: answer
    });
  });

  socket.on('ice-candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('ice-candidate', {
      fromSocketId: socket.id,
      candidate: candidate
    });
  });

  // Graceful Session Termination
  socket.on('disconnect', () => {
    activeSession.delete(socket.id);
    io.to('protrack-enterprise-room').emit('peer-disconnected', { socketId: socket.id });
    io.to('protrack-enterprise-room').emit('registry-update', Array.from(activeSession.values()));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Enterprise Core Engine] Running on port ${PORT}`);
});
