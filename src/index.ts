import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import dotenv from "dotenv";
import path from "path";
// load env
dotenv.config();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

// Store key in memory { eventId: { email, timestamp } }
const canvasLocks: Record<string, { email: string; timestamp: number }> = {};

const LOCK_TIMEOUT = 30 * 60 * 1000; // 30 minutes

const eventLocks = new Map<string, { email: string; socketId: string; lastActive: number }>();


io.on("connection", (socket) => {
  console.log("✅ user connected:", socket.id);

  socket.on("join_canvas", ({ email, eventId }) => {
    const now = Date.now();
    const existing = eventLocks.get(eventId);

    if (existing && now - existing.lastActive < LOCK_TIMEOUT && existing.socketId !== socket.id) {
      socket.emit("blocked", {
        message: "Someone is editing canvas",
        status : "locked"
      });
      return;
    }

    eventLocks.set(eventId, { email, socketId: socket.id, lastActive: now });
    socket.emit("joined", {
      message: "You have access to the canvas",
      status : "open"
    });
    console.log(`🔒 ${email} locked event ${eventId}`);
  });

  // update activity biar lock gak expired
  socket.on("heartbeat", ({ email, eventId }) => {
    const lock = eventLocks.get(eventId);
    if (lock && lock.socketId === socket.id) {
      lock.lastActive = Date.now();
      eventLocks.set(eventId, lock);
    }
  });

  // kalau disconnect → release lock
  socket.on("disconnect", () => {
    for (const [eventId, lock] of eventLocks.entries()) {
      if (lock.socketId === socket.id) {
        eventLocks.delete(eventId);
        console.log(`🔓 Lock released for event ${eventId}`);
      }
    }
  });
});

app.use(express.static(path.join(__dirname, "../public")));

// Routes
app.get("/", (req: Request, res: Response) => {
  res.send("Hello from studio viding");
});


httpServer.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
