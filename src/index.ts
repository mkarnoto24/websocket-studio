import express from 'express'
import type { Request, Response } from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import dotenv from 'dotenv'
import path from 'path'
import { getUserById } from './db/dto/users'
import { getWebById } from './db/dto/webs'

dotenv.config()
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  path: '/ws',
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

const LOCK_TIMEOUT = 30 * 60 * 1000
const CHECK_INTERVAL = 60 * 1000

// Simpan event yang dikunci
const eventLocks = new Map<string, { email: string; socketId: string; lastActive: number }>()

// ========== CONNECTION LOGGING ==========
io.engine.on('connection_error', (err) => {
  console.log('========== CONNECTION ERROR ==========')
  console.log('Error Name:', err.name)
  console.log('Message:', err.message)
  console.log('Code:', err.code)
  console.log('Context:', err.context)
  console.log('=====================================')
})

// ========== SOCKET CORE LOGIC ==========
io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.id}`)

  // ========== JOIN CANVAS ==========
  socket.on('join_canvas', async ({ email, eventId }) => {
    const now = Date.now()

    const user = await getUserById(email)
    const web = await getWebById(eventId)
    if (!user) return socket.emit('forbidden', { message: 'User Not Found', status: 'forbidden' })
    if (!web) return socket.emit('forbidden', { message: 'ID Not Found', status: 'forbidden' })
    if (user.tenant_id !== web.tenant_id)
      return socket.emit('forbidden', { message: 'Invalid user or ID', status: 'forbidden' })

    const existing = eventLocks.get(eventId)

    // Cek kalau sudah di-lock user lain
    if (existing && now - existing.lastActive < LOCK_TIMEOUT && existing.socketId !== socket.id) {
      const remaining = Math.ceil((LOCK_TIMEOUT - (now - existing.lastActive)) / 60000)
      socket.emit('blocked', {
        message: `Someone is editing canvas (expires in ${remaining} min)`,
        status: 'locked'
      })
      console.log(`🚫 ${email} tried to access ${eventId}, locked by ${existing.email}`)
      return
    }

    // Set / update lock
    eventLocks.set(eventId, { email, socketId: socket.id, lastActive: now })
    socket.emit('joined', { message: 'You have access to the canvas', status: 'open' })
    console.log(`🔒 ${email} locked event ${eventId}`)
  })

  // ========== HEARTBEAT (keep lock alive) ==========
  socket.on('heartbeat', ({ eventId }) => {
    const lock = eventLocks.get(eventId)
    if (lock && lock.socketId === socket.id) {
      lock.lastActive = Date.now()
      eventLocks.set(eventId, lock)
      console.log(`❤️ Heartbeat from ${lock.email} for event ${eventId}`)
    }
  })

  // ========== DISCONNECT ==========
  socket.on('disconnect', () => {
    for (const [eventId, lock] of eventLocks.entries()) {
      if (lock.socketId === socket.id) {
        eventLocks.delete(eventId)
        io.emit('unlock', {
          event_id: eventId,
          message: 'You have access to the canvas',
          status: 'open'
        })
        console.log(`🔓 Lock released for event ${eventId}`)
      }
    }
  })
})

// ========== AUTO UNLOCK CHECKER ==========
setInterval(() => {
  const now = Date.now()
  if (eventLocks.size === 0) return

  console.log(`🕐 Checking locks (${eventLocks.size} active):`)
  for (const [eventId, lock] of eventLocks.entries()) {
    const age = now - lock.lastActive
    const remaining = Math.ceil((LOCK_TIMEOUT - age) / 60000)
    if (remaining > 0) {
      console.log(`   ⏳ ${lock.email} on ${eventId} → ${remaining} min left`)
    }

    if (age > LOCK_TIMEOUT) {
      eventLocks.delete(eventId)
      io.emit('unlock', {
        event_id: eventId,
        message: 'Lock expired — canvas is now available',
        status: 'open'
      })
      console.log(`⌛ Auto-unlocked expired lock for ${eventId}`)
    }
  }
}, CHECK_INTERVAL)

// ========== EXPRESS ROUTES ==========
app.use(express.static(path.join(__dirname, '../public')))

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Viding Studio WebSocket', version: 'V1' })
})

app.get('/debug/locks', (req, res) => {
  const data = Array.from(eventLocks.entries()).map(([eventId, lock]) => ({
    eventId,
    email: lock.email,
    socketId: lock.socketId,
    lastActive: new Date(lock.lastActive).toISOString(),
    minutesRemaining: Math.max(
      0,
      Math.ceil((LOCK_TIMEOUT - (Date.now() - lock.lastActive)) / 60000)
    )
  }))
  res.json({ activeLocks: data, count: eventLocks.size })
})

app.get('/url_socket.js', (req, res) => {
  res.type('application/javascript')
  res.send(`window.ENV = { APP_URL: "${APP_URL}" }`)
})

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://localhost:${PORT} and socket url ${APP_URL}`)
})
