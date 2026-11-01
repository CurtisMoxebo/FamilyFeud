import express, { Request, Response } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { config } from './config/env';

const app = express();
const server = http.createServer(app);

// CORS configuration for REST and WebSockets
const allowedOrigins = [config.clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman)
      if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://192.168.')) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive for local party LAN access
    },
    credentials: true,
  })
);

app.use(express.json());

// Health Check Endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    service: 'family-feud-backend',
  });
});

// Initialize Socket.io Server
export const io = new SocketIOServer(server, {
  cors: {
    origin: '*', // Permissive for mobile device LAN access
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Client disconnected (${socket.id}): ${reason}`);
  });
});

// Start listening
server.listen(config.port, () => {
  console.log(`=========================================`);
  console.log(`🚀 Family Feud Backend Server Running!`);
  console.log(`📡 Port: ${config.port}`);
  console.log(`🌐 Health Check: http://localhost:${config.port}/api/health`);
  console.log(`🎮 Client Origin: ${config.clientUrl}`);
  console.log(`=========================================`);
});

export default server;

