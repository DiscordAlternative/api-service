# API Service - Endpoints Documentation

Bu dosya, API Service'in tüm endpoint'lerini,  request/response formatlarını ve kullanım örneklerini içerir.

## Base URL
```
http://localhost:3001
```

---

## Authentication Endpoints

### POST /auth/register
Yeni kullanıcı kaydı oluştur.

**Request:**
```json
{
  "email": "user@example.com",
  "username": "testuser",
  "password": "SecurePass123!",
  "dateOfBirth": "1990-01-01T00:00:00Z"
}
```

**Response (201):**
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "username": "testuser",
  "email": "user@example.com",
  "discriminator": "1234",
  "verificationEmailSent": true
}
```

**Variables:**
- `email`: Email adresi (required, email format)
- `username`: Kullanıcı adı (required, 2-32 karakter)
- `password`: Şifre (required, minimum 8 karakter)
- `dateOfBirth`: Doğum tarihi ISO format (required)

**Returns:**
- `userId`: Oluşturulan kullanıcı ID'si
- `username`: Kullanıcı adı
- `email`: Email adresi
- `discriminator`: 4 haneli ayırıcı (örn: #1234)
- `verificationEmailSent`: Email gönderildi mi

---

### POST /auth/login
Kullanıcı girişi yap ve token al.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "testuser",
    "discriminator": "1234",
    "email": "user@example.com",
    "emailVerified": true
  }
}
```

**Variables:**
- `email`: Email adresi (required)
- `password`: Şifre (required)

**Returns:**
- `accessToken`: JWT access token (15 dakika geçerli)
- `refreshToken`: JWT refresh token (7 gün geçerli)
- `user`: Kullanıcı bilgileri

---

### POST /auth/refresh
Access token yenile.

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Variables:**
- `refreshToken`: Refresh token (required)

**Returns:**
- Yeni access ve refresh token

---

### POST /auth/logout
Çıkış yap (tüm session'ları temizle).

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response (204):**
No content

---

### POST /auth/verify-email
Email adresini doğrula.

**Request:**
```json
{
  "token": "verification-token-here"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

---

### POST /auth/forgot-password
Şifre sıfırlama talebi.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "If the email exists, a password reset link has been sent"
}
```

---

### POST /auth/reset-password
Şifre sıfırla.

**Request:**
```json
{
  "token": "reset-token",
  "newPassword": "NewSecurePass123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

---

### POST /auth/enable-2fa
2FA aktive et (QR kod ve backup kodları al).

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response (200):**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "data:image/png;base64,...",
  "backupCodes": ["a1b2c3d4...", "e5f6g7h8..."]
}
```

---

### POST /auth/verify-2fa
2FA kodunu doğrula ve aktive et.

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Request:**
```json
{
  "code": "123456"
}
```

**Response (200):**
```json
{
  "enabled": true,
  "message": "2FA enabled successfully"
}
```

---

## User Endpoints

### GET /users/@me
Kendi profil bilgilerini getir.

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response (200):**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "username": "testuser",
  "discriminator": "1234",
  "email": "user@example.com",
  "avatar": "https://cdn.example.com/avatars/...",
  "banner": "https://cdn.example.com/banners/...",
  "bio": "Hello world!",
  "customStatus": "🎮 Gaming",
  "badges": ["verified", "early_supporter"],
  "emailVerified": true,
  "twoFactorEnabled": false,
  "createdAt": "2024-01-01T00:00:00Z"
}
```

---

### PATCH /users/@me
Profil bilgilerini güncelle.

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Request:**
```json
{
  "username": "newusername",
  "bio": "New bio text",
  "customStatus": "🌙 AFK"
}
```

**Response (200):**
```json
{
  "success": true,
  "bio": "New bio text",
  "customStatus": "🌙 AFK"
}
```

**Variables:**
- `username`: Yeni kullanıcı adı (optional, 2-32 karakter)
- `bio`: Biyografi (optional, max 190 karakter)
- `customStatus`: Özel durum (optional, max 128 karakter)

---

### POST /users/@me/avatar
Avatar yükle.

**Headers:**
```
Authorization: Bearer <accessToken>
```

** Response (200):**
```json
{
  "avatarUrl": "data:image/png;base64,..."
}
```

---

### GET /users/:userId
Başka kullanıcının profilini getir.

**Response (200):**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "username": "testuser",
  "discriminator": "1234",
  "avatar": "https://cdn.example.com/avatars/...",
  "banner": "https://cdn.example.com/banners/...",
  "bio": "Hello world!",
  "customStatus": "🎮 Gaming",
  "badges": [],
  "createdAt": "2024-01-01T00:00:00Z"
}
```

---

### GET /users/@me/settings
Kullanıcı ayarlarını getir.

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response (200):**
```json
{
  "theme": "dark",
  "language": "en",
  "notifications": {
    "email": true,
    "push": true,
    "mentionOnly": false
  },
  "privacy": {
    "showOnlineStatus": true,
    "allowDMs": "everyone"
  }
}
```

---

### PATCH /users/@me/settings
Kullanıcı ayarlarını güncelle.

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Request:**
```json
{
  "theme": "light",
  "notifications": {
    "mentionOnly": true
  },
  "privacy": {
    "allowDMs": "friends"
  }
}
```

**Variables:**
- `theme`: Tema ("dark" veya "light")
- `language`: Dil kodu (örn: "en", "tr")
- `notifications`: Bildirim ayarları
  - `email`: Email bildirimi (boolean)
  - `push`: Push bildirimi (boolean)
  - `mentionOnly`: Sadece mention'larda bildirim (boolean)
- `privacy`: Gizlilik ayarları
  - `showOnlineStatus`: Online durumunu göster (boolean)
  - `allowDMs`: DM izinleri ("everyone", "friends", "none")

---

### GET /users/search
Kullanıcı ara.

**Query Parameters:**
- `q`: Arama terimi (required)
- `limit`: Sonuç limiti (optional, default: 20, max: 50)

**Example:**
```
GET /users/search?q=test&limit=10
```

**Response (200):**
```json
{
  "users": [
    {
      "id": "507f1f77bcf86cd799439011",
      "username": "testuser",
      "discriminator": "1234",
      "avatar": "https://cdn.example.com/avatars/..."
    }
  ]
}
```

---

## Server Endpoints

### POST /servers
Yeni sunucu oluştur.

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Request:**
```json
{
  "name": "My Server",
  "icon": "data:image/png;base64,..."
}
```

**Response (201):**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "name": "My Server",
  "icon": "https://cdn.example.com/icons/...",
  "ownerId": "507f1f77bcf86cd799439011",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

---

## Notes

- Tüm protected endpoint'ler `Authorization: Bearer <accessToken>` header gerektirir
- Timestamp'ler ISO 8601 formatında döner
- ObjectId'ler 24 karakterlik hex string olarak döner
- Rate limiting tüm endpoint'lerde aktiftir
- Validation hataları 422 status code ile döner

---

## Development Testing

Server'ı çalıştırma:
```bash
cd /Users/berke/Desktop/Projeler/DiscordAlternative/backend/api-service
bun run dev
```

Health check:
```bash
curl http://localhost:3001/health
```

Postman/Insomnia kullanarak tüm endpoint'leri test edebilirsiniz.
