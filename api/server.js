import http from 'node:http';
import app from '../app.js';
import { initSocket } from '../socket.js';
import { ensureRuntimeReady } from '../middleware/runtime.js';

// Vercel owns the listener. Exporting the HTTP server preserves WebSocket upgrades.
const server = http.createServer(app);
initSocket(server, { beforeAuthenticate: ensureRuntimeReady });

export default server;
