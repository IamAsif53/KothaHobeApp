import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { connectDB } from './config/db';
import { ENV } from './config/env';
import { setupSocketIO } from './sockets/socketManager';

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 30000,
  pingInterval: 10000,
});

// Setup Socket.IO real-time handlers
setupSocketIO(io);

// Start Server immediately, then connect DB
server.listen(ENV.PORT, () => {
  console.log(`=================================`);
  console.log(`🚀 Kotha Hobe Server Running`);
  console.log(`📡 Port: ${ENV.PORT}`);
  console.log(`🔗 Health: http://localhost:${ENV.PORT}/api/health`);
  console.log(`=================================`);
  connectDB();
});
