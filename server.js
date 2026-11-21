import http from "http";
import app from "./app.js";
import dotenv from "dotenv";
import { initSocket } from "./socket.js";
import { ConnectDb } from './config/db.js';

dotenv.config({ quiet: true });

const server = http.createServer(app);

// Initialize Socket.io on the HTTP server
initSocket(server);

const port = process.env.PORT || 9000;
try {
if (!process.env.JWT_SECRET || !process.env.DATABASE) throw new Error('DATABASE and JWT_SECRET are required.');
await ConnectDb();
server.listen(port, '0.0.0.0', () => {
    console.log(`Server running with Sockets on http://0.0.0.0:${port}`);
    console.log(`Local access:   http://localhost:${port}`);
});
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
