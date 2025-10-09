import express from 'express'
import type { Request, Response } from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import dotenv from 'dotenv'
import path from 'path'
import { getUserById } from './db/dto/users'
import { getWebById } from './db/dto/webs'
// load env
dotenv.config()
// @ts-ignore
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  path: '/ws',
  cors: { origin: '*' }
})

const LOCK_TIMEOUT = 30 * 60 * 1000 // 30 minutes

const eventLocks = new Map<string, { email: string; socketId: string; lastActive: number }>()

io.on('connection', (socket) => {
  console.log('✅ user connected:', socket.id)

  // socket.on('join_canvas', async ({ email, eventId }) => {
  //   const now = Date.now()

  //   const user = await getUserById(email)
  //   const web = await getWebById(eventId)
  //   if (!user) {
  //     socket.emit('forbidden', {
  //       message: 'User Not Found',
  //       status: 'forbidden'
  //     })
  //     return
  //   }
  //   if (!web) {
  //     socket.emit('forbidden', {
  //       message: 'ID Not Found',
  //       status: 'forbidden'
  //     })
  //     return
  //   }

  //   if(user.tenant_id !== web.tenant_id){
  //     socket.emit('forbidden', {
  //       message: 'ID or User Not Found',
  //       status: 'forbidden'
  //     })
  //     return
  //   }

  //   const existing = eventLocks.get(eventId)

  //   if (existing && now - existing.lastActive < LOCK_TIMEOUT && existing.socketId !== socket.id) {
  //     socket.emit('blocked', {
  //       message: 'Someone is editing canvas',
  //       status: 'locked'
  //     })
  //     return
  //   }

  //   eventLocks.set(eventId, { email, socketId: socket.id, lastActive: now })
  //   socket.emit('joined', {
  //     message: 'You have access to the canvas',
  //     status: 'open'
  //   })
  //   console.log(`🔒 ${email} locked event ${eventId}`)
  // })
  socket.on('join_canvas', async ({ email, eventId }) => {
    const now = Date.now()

    const user = await getUserById(email)
    const web = await getWebById(eventId)

    if (!user) {
      socket.emit('forbidden', { message: 'User Not Found', status: 'forbidden' })
      return
    }

    if (!web) {
      socket.emit('forbidden', { message: 'ID Not Found', status: 'forbidden' })
      return
    }

    if (user.tenant_id !== web.tenant_id) {
      socket.emit('forbidden', { message: 'ID or User Not Found', status: 'forbidden' })
      return
    }

    const existing = eventLocks.get(eventId)

    if (existing && now - existing.lastActive < LOCK_TIMEOUT && existing.socketId !== socket.id) {
      socket.emit('blocked', { message: 'Someone is editing canvas', status: 'locked' })
      return
    }

    eventLocks.set(eventId, { email, socketId: socket.id, lastActive: now })
    socket.emit('joined', { message: 'You have access to the canvas', status: 'open' })

    io.emit('lock_acquired', { eventId, email })

    console.log(`${email} locked event ${eventId}`)
  })

  socket.on('heartbeat', ({ eventId }) => {
    const lock = eventLocks.get(eventId)
    if (lock && lock.socketId === socket.id) {
      lock.lastActive = Date.now()
      eventLocks.set(eventId, lock)
      console.log(`Heartbeat from ${lock.email} for event ${eventId}`)
    }
  })

  socket.on('disconnect', () => {
    for (const [eventId, lock] of eventLocks.entries()) {
      if (lock.socketId === socket.id) {
        eventLocks.delete(eventId)
        io.emit('unlock', { eventId }) // broadcast unlock
        console.log(`🔓 Lock released for event ${eventId}`)
      }
    }
  })
})

setInterval(() => {
  const now = Date.now()
  for (const [eventId, lock] of eventLocks.entries()) {
    if (now - lock.lastActive > LOCK_TIMEOUT) {
      eventLocks.delete(eventId)
      io.emit('unlock', { eventId }) // broadcast unlock
      console.log(`⏰ Auto-unlocked expired lock for event ${eventId}`)
    }
  }
}, 60 * 1000)

app.use(express.static(path.join(__dirname, '../public')))

// Routes
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Viding Studio WebSocket',
    version: 'V1'
  })
})
app.get('/users/:idOrEmail', async (req: Request, res: Response) => {
  const user = await getUserById(req.params.idOrEmail as string)
  res.json({
    message: 'Success',
    data: user
  })
})
app.get('/url_socket.js', (req, res) => {
  res.type('application/javascript')
  res.send(`window.ENV = { APP_URL: "${APP_URL}" }`)
})

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://localhost:${PORT} and socket url ${APP_URL}`)
})
