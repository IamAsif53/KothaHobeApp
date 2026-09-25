import http from 'http';
import https from 'https';
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
    credentials: true,
  },
  pingTimeout: 20000,
  pingInterval: 15000,
  connectTimeout: 20000,
  allowUpgrades: true,
  transports: ['websocket', 'polling'],
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

  // Self-Ping Keep-Alive to prevent cloud hosting (Render) from sleeping when idle
  const KEEP_ALIVE_URL = process.env.RENDER_EXTERNAL_URL || 'https://kotha-hobe-api.onrender.com';
  const KEEP_ALIVE_INTERVAL = 9 * 60 * 1000; // 9 minutes (Render sleeps at 15m)

  setInterval(() => {
    try {
      const healthUrl = `${KEEP_ALIVE_URL}/api/health`;
      const client = healthUrl.startsWith('https') ? https : http;
      client.get(healthUrl, (res) => {
        console.log(`[KeepAlive] 💓 Self ping response status: ${res.statusCode}`);
      }).on('error', (err) => {
        console.warn(`[KeepAlive] Self ping notice:`, err.message);
      });
    } catch (e) {
      console.warn(`[KeepAlive] Self ping error:`, e);
    }
  }, KEEP_ALIVE_INTERVAL);
});
