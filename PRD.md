# API Service - Product Requirements Document

> [!IMPORTANT]
> Bu servis, Discord alternatifinin tüm genel API endpoint'lerini yönetir: kullanıcı kimlik doğrulaması, sunucu yönetimi, profil işlemleri, kanal yönetimi ve mesajlaşma.

---

## 1. Servis Genel Bakış

### 1.1 Amaç
Tüm temel iş mantığını barındıran ana API servisi. Auth, sunucu, kanal ve mesaj operasyonlarından sorumludur.

### 1.2 Teknik Stack
- **Runtime**: Bun.js (multi-threaded mode)
- **Framework**: Elysia.js v1.3+ (TypeScript-first)
- **Database**: MongoDB (primary database)
- **Cache**: Redis (user sessions, rate limiting)
- **Validation**: Zod (built-in with Elysia)
- **Authentication**: JWT (access + refresh tokens)
- **Documentation**: OpenAPI 3.0 (auto-generated)

### 1.3 Port ve Deployment
- **Port**: 3001
- **Internal URL**: `http://api-service:3001`
- **External URL**: `https://api.discord-alt.com`

---

## 2. Multi-Threading ile Bun.js

Bun.js'in multi-threaded özelliklerini kullanarak yüksek performans sağlanacak:

### 2.1 Worker Threads
```typescript
// src/workers/message-processor.ts
import { Worker } from 'bun'

// Heavy işler için worker kullan
const worker = new Worker('worker.ts')

worker.postMessage({ type: 'process_message', data: message })

worker.onmessage = (event) => {
  console.log('Processed:', event.data)
}
```

### 2.2 Cluster Mode
```typescript
// src/cluster.ts
import cluster from 'cluster'
import os from 'os'

const numCPUs = os.cpus().length

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`)
  
  // CPU sayısı kadar worker oluştur
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork()
  }
  
  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} died, restarting...`)
    cluster.fork()
  })
} else {
  // Worker process - API serverı başlat
  import('./index')
}
```

---

## 3. Domain'ler ve Endpoint'ler

### 3.1 Authentication Domain

#### 3.1.1 Endpoints

**POST /auth/register**
```typescript
Request:
{
  email: string,
  username: string,
  password: string,
  dateOfBirth: string (ISO 8601)
}

Response (201):
{
  userId: string,
  username: string,
  email: string,
  verificationEmailSent: boolean
}
```

**POST /auth/login**
```typescript
Request:
{
  email: string,
  password: string,
  captcha?: string
}

Response (200):
{
  accessToken: string,
  refreshToken: string,
  user: {
    id: string,
    username: string,
    email: string,
    avatar?: string
  }
}
```

**POST /auth/refresh**
```typescript
Request:
{
  refreshToken: string
}

Response (200):
{
  accessToken: string,
  refreshToken: string
}
```

**POST /auth/logout**
```typescript
Headers:
Authorization: Bearer {accessToken}

Response (204): No content
```

**POST /auth/verify-email**
```typescript
Request:
{
  token: string
}

Response (200):
{
  success: boolean,
  message: string
}
```

**POST /auth/forgot-password**
```typescript
Request:
{
  email: string
}

Response (200):
{
  message: string
}
```

**POST /auth/reset-password**
```typescript
Request:
{
  token: string,
  newPassword: string
}

Response (200):
{
  success: boolean
}
```

**POST /auth/enable-2fa**
```typescript
Headers:
Authorization: Bearer {accessToken}

Response (200):
{
  secret: string,
  qrCode: string (base64 image),
  backupCodes: string[]
}
```

**POST /auth/verify-2fa**
```typescript
Request:
{
  code: string (6-digit)
}

Headers:
Authorization: Bearer {accessToken}

Response (200):
{
  enabled: boolean
}
```

#### 3.1.2 Database Schema
```typescript
// users collection
{
  _id: ObjectId,
  email: string (unique, indexed),
  username: string (unique, indexed),
  discriminator: string (4-digit, örn: #1234),
  password: string (bcrypt),
  emailVerified: boolean,
  emailVerificationToken?: string,
  emailVerificationExpiry?: Date,
  passwordResetToken?: string,
  passwordResetExpiry?: Date,
  twoFactorSecret?: string,
  twoFactorEnabled: boolean,
  twoFactorBackupCodes?: string[],
  publicKey?: string (RSA public key for E2E),
  lastLoginAt?: Date,
  createdAt: Date,
  updatedAt: Date
}

// sessions collection (Redis'te de tutulur)
{
  _id: ObjectId,
  userId: ObjectId,
  refreshToken: string (hashed, indexed),
  deviceInfo: string,
  ipAddress: string,
  expiresAt: Date,
  createdAt: Date
}
```

#### 3.1.3 Güvenlik
- Bcrypt password hashing (12 rounds)
- JWT access token: 15 dakika expiry
- JWT refresh token: 7 gün expiry
- Rate limiting: 
  - Register: 3 requests/hour per IP
  - Login: 5 requests/min per IP
  - Password reset: 3 requests/hour per email
- Email verification zorunlu (production)
- Strong password policy: min 8 char, uppercase, lowercase, number

---

### 3.2 User Domain

#### 3.2.1 Endpoints

**GET /users/@me**
```typescript
Headers:
Authorization: Bearer {accessToken}

Response (200):
{
  id: string,
  username: string,
  discriminator: string,
  email: string,
  avatar?: string,
  banner?: string,
  bio?: string,
  customStatus?: string,
  emailVerified: boolean,
  twoFactorEnabled: boolean,
  createdAt: string
}
```

**PATCH /users/@me**
```typescript
Request:
{
  username?: string,
  bio?: string,
  customStatus?: string
}

Headers:
Authorization: Bearer {accessToken}

Response (200):
{
  ...updated user fields
}
```

**POST /users/@me/avatar**
```typescript
Request (multipart/form-data):
{
  avatar: File (image, max 5MB)
}

Response (200):
{
  avatarUrl: string
}
```

**GET /users/:userId**
```typescript
Response (200):
{
  id: string,
  username: string,
  discriminator: string,
  avatar?: string,
  banner?: string,
  bio?: string,
  customStatus?: string,
  createdAt: string
}
```

**GET /users/@me/settings**
```typescript
Response (200):
{
  theme: 'dark' | 'light',
  language: string,
  notifications: {
    email: boolean,
    push: boolean,
    mentionOnly: boolean
  },
  privacy: {
    showOnlineStatus: boolean,
    allowDMs: 'everyone' | 'friends' | 'none'
  }
}
```

**PATCH /users/@me/settings**
```typescript
Request:
{
  theme?: 'dark' | 'light',
  language?: string,
  notifications?: {...},
  privacy?: {...}
}

Response (200):
{
  ...updated settings
}
```

**GET /users/search**
```typescript
Query params:
?q=username&limit=20

Response (200):
{
  users: [
    {
      id: string,
      username: string,
      discriminator: string,
      avatar?: string
    }
  ]
}
```

#### 3.2.2 Database Schema
```typescript
// user_profiles collection
{
  _id: ObjectId (same as userId),
  username: string,
  discriminator: string,
  avatar?: string (CDN URL),
  banner?: string,
  bio?: string (max 190 chars),
  customStatus?: string (max 128 chars),
  badges: string[], // ['verified', 'admin', 'early_supporter']
  createdAt: Date,
  updatedAt: Date
}

// user_settings collection
{
  _id: ObjectId,
  userId: ObjectId (indexed),
  theme: 'dark' | 'light',
  language: string (default: 'en'),
  notifications: {
    email: boolean,
    push: boolean,
    mentionOnly: boolean
  },
  privacy: {
    showOnlineStatus: boolean,
    allowDMs: 'everyone' | 'friends' | 'none'
  },
  createdAt: Date,
  updatedAt: Date
}
```

---

### 3.3 Server (Guild) Domain

#### 3.3.1 Endpoints

**POST /servers**
```typescript
Request:
{
  name: string,
  icon?: string (base64)
}

Response (201):
{
  id: string,
  name: string,
  icon?: string,
  ownerId: string,
  createdAt: string
}
```

**GET /servers/:serverId**
```typescript
Response (200):
{
  id: string,
  name: string,
  icon?: string,
  banner?: string,
  description?: string,
  ownerId: string,
  memberCount: number,
  channels: Channel[],
  roles: Role[],
  createdAt: string
}
```

**PATCH /servers/:serverId**
```typescript
Request:
{
  name?: string,
  icon?: string,
  banner?: string,
  description?: string
}

Response (200):
{
  ...updated server
}
```

**DELETE /servers/:serverId**
```typescript
Response (204): No content
```

**GET /servers/:serverId/members**
```typescript
Query: ?limit=100&after={userId}

Response (200):
{
  members: [
    {
      user: {
        id: string,
        username: string,
        avatar?: string
      },
      nickname?: string,
      roles: string[],
      joinedAt: string
    }
  ]
}
```

**POST /servers/:serverId/members/:userId/kick**
```typescript
Request:
{
  reason?: string
}

Response (204): No content
```

**POST /servers/:serverId/bans**
```typescript
Request:
{
  userId: string,
  reason?: string,
  deleteMessageDays?: number (0-7)
}

Response (204): No content
```

**DELETE /servers/:serverId/bans/:userId**
```typescript
Response (204): No content
```

#### 3.3.2 Database Schema
```typescript
// servers collection
{
  _id: ObjectId,
  name: string,
  icon?: string,
  banner?: string,
  description?: string (max 500 chars),
  ownerId: ObjectId (indexed),
  vanityUrl?: string (unique),
  memberCount: number,
  features: string[], // ['verified', 'partnered', 'community']
  createdAt: Date,
  updatedAt: Date
}
// Index: {ownerId: 1, createdAt: -1}

// server_members collection
{
  _id: ObjectId,
  serverId: ObjectId,
  userId: ObjectId,
  nickname?: string,
  roles: ObjectId[] (role IDs),
  joinedAt: Date,
  updatedAt: Date
}
// Compound index: {serverId: 1, userId: 1} (unique)
// Index: {userId: 1} (user's servers)

// server_bans collection
{
  _id: ObjectId,
  serverId: ObjectId,
  userId: ObjectId,
  reason?: string,
  bannedBy: ObjectId,
  createdAt: Date
}
// Compound index: {serverId: 1, userId: 1} (unique)
```

---

### 3.4 Role & Permissions Domain

#### 3.4.1 Endpoints

**POST /servers/:serverId/roles**
```typescript
Request:
{
  name: string,
  color?: string (hex),
  permissions: number (bitwise),
  mentionable?: boolean,
  hoisted?: boolean
}

Response (201):
{
  id: string,
  name: string,
  color: string,
  position: number,
  permissions: number,
  ...
}
```

**PATCH /servers/:serverId/roles/:roleId**
```typescript
Request:
{
  name?: string,
  color?: string,
  permissions?: number,
  position?: number
}

Response (200):
{
  ...updated role
}
```

**DELETE /servers/:serverId/roles/:roleId**
```typescript
Response (204): No content
```

**PUT /servers/:serverId/members/:userId/roles/:roleId**
```typescript
Response (204): No content (role assigned)
```

**DELETE /servers/:serverId/members/:userId/roles/:roleId**
```typescript
Response (204): No content (role removed)
```

#### 3.4.2 Permissions System
```typescript
enum Permissions {
  VIEW_CHANNELS = 1 << 0,       // 1
  SEND_MESSAGES = 1 << 1,       // 2
  EMBED_LINKS = 1 << 2,         // 4
  ATTACH_FILES = 1 << 3,        // 8
  ADD_REACTIONS = 1 << 4,       // 16
  MANAGE_MESSAGES = 1 << 5,     // 32
  MENTION_EVERYONE = 1 << 6,    // 64
  USE_EXTERNAL_EMOJIS = 1 << 7, // 128
  CONNECT = 1 << 8,             // 256 (voice)
  SPEAK = 1 << 9,               // 512 (voice)
  MUTE_MEMBERS = 1 << 10,       // 1024
  DEAFEN_MEMBERS = 1 << 11,     // 2048
  MOVE_MEMBERS = 1 << 12,       // 4096
  MANAGE_CHANNELS = 1 << 13,    // 8192
  MANAGE_SERVER = 1 << 14,      // 16384
  KICK_MEMBERS = 1 << 15,       // 32768
  BAN_MEMBERS = 1 << 16,        // 65536
  ADMINISTRATOR = 1 << 17,      // 131072 (all permissions)
}

// Permission check utility
function hasPermission(userPerms: number, required: Permissions): boolean {
  if (userPerms & Permissions.ADMINISTRATOR) return true
  return (userPerms & required) === required
}

// Calculate user permissions in server
function calculatePermissions(roles: Role[]): number {
  let permissions = 0
  for (const role of roles) {
    permissions |= role.permissions
  }
  return permissions
}
```

#### 3.4.3 Database Schema
```typescript
// roles collection
{
  _id: ObjectId,
  serverId: ObjectId,
  name: string,
  color: string (hex, default: '#000000'),
  position: number (0 = lowest),
  permissions: number (bitwise),
  mentionable: boolean,
  hoisted: boolean, // Ayrı gösterilsin mi
  createdAt: Date,
  updatedAt: Date
}
// Compound index: {serverId: 1, position: 1}

// Default roles on server creation:
@everyone role (position: 0, all basic permissions)
```

---

### 3.5 Channel Domain

#### 3.5.1 Endpoints

**POST /servers/:serverId/channels**
```typescript
Request:
{
  name: string,
  type: 'text' | 'voice' | 'category',
  parentId?: string (category ID),
  topic?: string,
  nsfw?: boolean,
  // Voice-specific:
  userLimit?: number,
  bitrate?: number (kbps)
}

Response (201):
{
  id: string,
  serverId: string,
  name: string,
  type: string,
  position: number,
  ...
}
```

**PATCH /channels/:channelId**
```typescript
Request:
{
  name?: string,
  topic?: string,
  nsfw?: boolean,
  position?: number,
  parentId?: string
}

Response (200):
{
  ...updated channel
}
```

**DELETE /channels/:channelId**
```typescript
Response (204): No content
```

**PUT /channels/:channelId/permissions/:targetId**
```typescript
Request:
{
  targetType: 'user' | 'role',
  allow: number (bitwise),
  deny: number (bitwise)
}

Response (204): No content
```

#### 3.5.2 Database Schema
```typescript
// channels collection
{
  _id: ObjectId,
  serverId: ObjectId,
  name: string,
  type: 'text' | 'voice' | 'category',
  topic?: string,
  position: number,
  parentId?: ObjectId (category ID),
  nsfw: boolean,
  // Voice-specific
  userLimit?: number,
  bitrate?: number,
  createdAt: Date,
  updatedAt: Date
}
// Compound index: {serverId: 1, position: 1}

// channel_permissions collection (overwrites)
{
  _id: ObjectId,
  channelId: ObjectId,
  targetId: ObjectId (user or role ID),
  targetType: 'user' | 'role',
  allow: number (bitwise),
  deny: number (bitwise),
  createdAt: Date
}
// Compound index: {channelId: 1, targetId: 1} (unique)
```

---

### 3.6 Message Domain

#### 3.6.1 Endpoints

**POST /channels/:channelId/messages**
```typescript
Request:
{
  content: string,
  nonce?: string (client-generated ID),
  replyTo?: string (message ID),
  // For DMs with E2E encryption:
  encrypted?: boolean,
  encryptedKeys?: {[userId: string]: string}
}

Response (201):
{
  id: string,
  channelId: string,
  authorId: string,
  content: string,
  timestamp: string,
  nonce?: string,
  ...
}

WebSocket event: 'message:new' broadcasted
```

**GET /channels/:channelId/messages**
```typescript
Query: ?limit=50&before={messageId}&after={messageId}

Response (200):
{
  messages: [
    {
      id: string,
      channelId: string,
      author: {
        id: string,
        username: string,
        avatar?: string
      },
      content: string,
      timestamp: string,
      edited: boolean,
      attachments: Attachment[],
      reactions: Reaction[],
      replyTo?: string
    }
  ]
}
```

**PATCH /channels/:channelId/messages/:messageId**
```typescript
Request:
{
  content: string
}

Response (200):
{
  ...updated message,
  edited: true,
  editedAt: string
}

WebSocket event: 'message:update'
```

**DELETE /channels/:channelId/messages/:messageId**
```typescript
Response (204): No content

WebSocket event: 'message:delete'
```

**POST /channels/:channelId/messages/:messageId/reactions/:emoji**
```typescript
Response (204): No content

WebSocket event: 'message:reaction_add'
```

**DELETE /channels/:channelId/messages/:messageId/reactions/:emoji**
```typescript
Response (204): No content

WebSocket event: 'message:reaction_remove'
```

**POST /channels/:channelId/typing**
```typescript
Response (204): No content

WebSocket event: 'typing:start' (10 sec timeout)
```

#### 3.6.2 Database Schema
```typescript
// messages collection
{
  _id: ObjectId,
  channelId: ObjectId,
  authorId: ObjectId,
  content: string,
  nonce?: string,
  // E2E encryption (DM only)
  encrypted: boolean,
  encryptedKeys?: {[userId: string]: string},
  // Metadata
  attachments: [
    {
      id: string,
      url: string,
      filename: string,
      size: number,
      contentType: string,
      width?: number,
      height?: number
    }
  ],
  embeds: object[],
  mentions: {
    users: ObjectId[],
    roles: ObjectId[],
    channels: ObjectId[],
    everyone: boolean
  },
  reactions: [
    {
      emoji: string,
      count: number,
      users: ObjectId[] (max 100, then count only)
    }
  ],
  replyTo?: ObjectId,
  pinned: boolean,
  edited: boolean,
  editedAt?: Date,
  deletedAt?: Date, // Soft delete
  createdAt: Date
}
// Indexes:
// {channelId: 1, createdAt: -1} - Message feed
// {authorId: 1, createdAt: -1} - User's messages
// {content: 'text'} - Full-text search
// {nonce: 1} - Deduplication
```

---

## 4. WebSocket Integration

### 4.1 WebSocket Server Setup
```typescript
// src/websocket.ts
import { Elysia } from 'elysia'

const ws = new Elysia()
  .ws('/gateway', {
    open(ws) {
      console.log('Client connected:', ws.id)
      // Subscribe to user's channels
      const userId = ws.data.userId
      ws.subscribe(`user:${userId}`)
    },
    
    message(ws, message) {
      // Handle incoming messages
      switch (message.type) {
        case 'typing:start':
          ws.publish(`channel:${message.channelId}`, {
            type: 'typing:start',
            userId: ws.data.userId,
            channelId: message.channelId
          })
          break
          
        case 'presence:update':
          ws.publish(`user:${ws.data.userId}`, {
            type: 'presence:update',
            status: message.status
          })
          break
      }
    },
    
    close(ws) {
      console.log('Client disconnected:', ws.id)
    }
  })
```

### 4.2 Event Broadcasting
```typescript
// Publish to channel subscribers
function broadcastToChannel(channelId: string, event: any) {
  ws.publish(`channel:${channelId}`, event)
}

// Example: New message
broadcastToChannel('channel-123', {
  type: 'message:new',
  message: {...}
})
```

---

## 5. Rate Limiting

### 5.1 Redis-based Rate Limiter
```typescript
// src/middleware/rateLimit.ts
import { redis } from './redis'

interface RateLimitOptions {
  windowMs: number
  max: number
  keyPrefix: string
}

async function rateLimit(
  identifier: string,
  options: RateLimitOptions
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `${options.keyPrefix}:${identifier}`
  const now = Date.now()
  const windowStart = now - options.windowMs
  
  // Remove old entries
  await redis.zremrangebyscore(key, 0, windowStart)
  
  // Count requests in window
  const count = await redis.zcard(key)
  
  if (count >= options.max) {
    return { allowed: false, remaining: 0 }
  }
  
  // Add current request
  await redis.zadd(key, now, `${now}`)
  await redis.expire(key, Math.ceil(options.windowMs / 1000))
  
  return { allowed: true, remaining: options.max - count - 1 }
}

// Usage in route
app.post('/api/messages', async ({ body, headers, set }) => {
  const userId = getUserIdFromToken(headers.authorization)
  
  const limit = await rateLimit(userId, {
    windowMs: 10000, // 10 seconds
    max: 10,
    keyPrefix: 'message_send'
  })
  
  if (!limit.allowed) {
    set.status = 429
    return { error: 'Rate limit exceeded' }
  }
  
  // Process message...
})
```

### 5.2 Rate Limit Tiers
```typescript
const RATE_LIMITS = {
  // Auth
  'auth:register': { windowMs: 3600000, max: 3 }, // 3 per hour
  'auth:login': { windowMs: 60000, max: 5 }, // 5 per minute
  'auth:password-reset': { windowMs: 3600000, max: 3 },
  
  // Messages
  'message:send': { windowMs: 10000, max: 10 }, // 10 per 10 sec
  'message:edit': { windowMs: 60000, max: 20 },
  
  // API calls (general)
  'api:user': { windowMs: 60000, max: 100 }, // 100 per minute
}
```

---

## 6. Caching Strategy

### 6.1 Redis Cache Layers
```typescript
// User profile cache
async function getUserProfile(userId: string) {
  const cacheKey = `cache:user:${userId}`
  
  // Try cache first
  const cached = await redis.get(cacheKey)
  if (cached) {
    return JSON.parse(cached)
  }
  
  // Fetch from DB
  const user = await db.collection('user_profiles').findOne({ _id: new ObjectId(userId) })
  
  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(user))
  
  return user
}

// Invalidate cache
async function invalidateUserProfile(userId: string) {
  await redis.del(`cache:user:${userId}`)
}
```

### 6.2 Cache Keys
```typescript
// User
cache:user:{userId} -> UserProfile (TTL: 5 min)
cache:user:settings:{userId} -> Settings (TTL: 10 min)

// Server
cache:server:{serverId} -> Server (TTL: 10 min)
cache:server:members:{serverId} -> Member[] (TTL: 5 min)

// Permissions
cache:permissions:{userId}:{serverId}:{channelId} -> number (TTL: 5 min)

// Messages (recent)
cache:channel:messages:{channelId} -> Message[] (TTL: 1 hour, last 100)
```

---

## 7. Error Handling

### 7.1 Global Error Handler
```typescript
app.onError(({ code, error, set }) => {
  // Log error
  logger.error({ code, error: error.message, stack: error.stack })
  
  // Handle specific error types
  if (code === 'VALIDATION') {
    set.status = 422
    return {
      error: 'Validation Error',
      details: error.all
    }
  }
  
  if (code === 'NOT_FOUND') {
    set.status = 404
    return {
      error: 'Not Found',
      message: 'The requested resource was not found'
    }
  }
  
  if (error.name === 'UnauthorizedError') {
    set.status = 401
    return {
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    }
  }
  
  // Generic server error
  set.status = 500
  return {
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? undefined : error.message
  }
})
```

---

## 8. Security

### 8.1 JWT Middleware
```typescript
// src/middleware/auth.ts
import { jwt } from '@elysiajs/jwt'

const jwtPlugin = jwt({
  name: 'jwt',
  secret: process.env.JWT_SECRET!,
  exp: '15m'
})

// Protect route
app.use(jwtPlugin)
  .get('/protected', async ({ jwt, headers, set }) => {
    const token = headers.authorization?.replace('Bearer ', '')
    
    if (!token) {
      set.status = 401
      return { error: 'No token provided' }
    }
    
    const payload = await jwt.verify(token)
    
    if (!payload) {
      set.status = 401
      return { error: 'Invalid token' }
    }
    
    // Token valid, proceed
    return { userId: payload.userId }
  })
```

### 8.2 Input Sanitization
```typescript
import { t } from 'elysia'

// Validation schemas
const CreateServerSchema = t.Object({
  name: t.String({ minLength: 2, maxLength: 100 }),
  icon: t.Optional(t.String())
})

app.post('/servers', ({ body }) => {
  // body is auto-validated
  // XSS prevention: sanitize in application layer
  const sanitizedName = sanitize(body.name)
  
  // Create server...
}, {
  body: CreateServerSchema
})
```

---

## 9. Monitoring ve Logging

### 9.1 Pino Logger
```typescript
// src/logger.ts
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined
})

// Usage
logger.info({ userId, action: 'create_server' }, 'Server created')
logger.error({ err, userId }, 'Failed to process message')
```

### 9.2 Metrics
```typescript
// src/metrics.ts
import { Counter, Histogram, register } from 'prom-client'

const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status']
})

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration',
  buckets: [10, 50, 100, 500, 1000, 5000]
})

// Metrics endpoint
app.get('/metrics', () => {
  return register.metrics()
})
```

---

## 10. Deployment

### 10.1 Dockerfile
```dockerfile
FROM oven/bun:latest

WORKDIR /app

# Dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# Source code
COPY . .

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \\
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["bun", "run", "src/index.ts"]
```

### 10.2 Environment Variables
```env
# Server
PORT=3001
NODE_ENV=production

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/discord-alt
REDIS_URL=redis://redis:6379

# JWT
JWT_SECRET=your-secret-key-change-this
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=https://discord-alt.com

# Rate Limiting
RATE_LIMIT_ENABLED=true

# Logging
LOG_LEVEL=info
```

---

## 11. Testing

### 11.1 Unit Tests
```typescript
// __tests__/auth.test.ts
import { describe, test, expect } from 'bun:test'
import { app } from '../src/index'

describe('Authentication', () => {
  test('POST /auth/register - creates user', async () => {
    const res = await app.handle(
      new Request('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          username: 'testuser',
          password: 'SecurePass123!'
        })
      })
    )
    
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data).toHaveProperty('userId')
  })
})
```

---

## 12. Performance Targets

- API response time: < 100ms (p95)
- Database query time: < 50ms
- JWT validation: < 5ms
- Redis cache hit ratio: > 80%
- Throughput: 10,000 requests/second (multi-threaded)
- WebSocket latency: < 50ms

---

## Özet

API Service, tüm core domain logic'i içeren ana mikroservistir. Multi-threaded Bun.js ile yüksek performans, Elysia.js ile type-safe API development, MongoDB + Redis ile scalability sağlanır. JWT authentication, rate limiting, caching ve comprehensive error handling ile production-ready bir servis oluşturulmuştur.
