import { Elysia, t } from 'elysia';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../config/database';
import { getRedis, cacheSet, cacheDel } from '../config/redis';
import { logger } from '../config/logger';
import { authMiddleware } from '../middleware/auth';
import {
    User,
    Session,
    RegisterSchema,
    LoginSchema,
    RefreshTokenSchema,
    VerifyEmailSchema,
    ForgotPasswordSchema,
    ResetPasswordSchema,
    Verify2FASchema,
    hashPassword,
    verifyPassword,
    generateDiscriminator,
    generateToken,
} from '../models/user';
import {
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
    getRefreshTokenExpiry,
} from '../utils/jwt';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export const authRoutes = new Elysia({ prefix: '/auth' })
    // POST /auth/register
    .post('/register', async ({ body, set }) => {
        const db = getDatabase();

        const { email, username, password, dateOfBirth } = body;

        // Check if user already exists
        const existingUser = await db.collection<User>('users').findOne({
            $or: [{ email }, { username }],
        });

        if (existingUser) {
            set.status = 409;
            return {
                error: 'User already exists',
                message: existingUser.email === email ? 'Email already in use' : 'Username already taken',
            };
        }

        // Generate discriminator
        const discriminator = generateDiscriminator();

        // Hash password
        const hashedPassword = await hashPassword(password);

        // Generate email verification token
        const emailVerificationToken = generateToken();

        // Create user
        const user: User = {
            email,
            username,
            discriminator,
            password: hashedPassword,
            emailVerified: false,
            emailVerificationToken,
            emailVerificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            twoFactorEnabled: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await db.collection<User>('users').insertOne(user);

        logger.info({ userId: result.insertedId, username }, 'User registered');

        set.status = 201;
        return {
            userId: result.insertedId.toString(),
            username,
            email,
            discriminator,
            verificationEmailSent: true,
        };
    }, {
        body: RegisterSchema,
    })

    // POST /auth/login
    .post('/login', async ({ body, set, request }) => {
        const db = getDatabase();
        const { email, password } = body;

        // Find user
        const user = await db.collection<User>('users').findOne({ email });

        if (!user) {
            set.status = 401;
            return { error: 'Invalid credentials' };
        }

        // Verify password
        const isPasswordValid = await verifyPassword(password, user.password);

        if (!isPasswordValid) {
            set.status = 401;
            return { error: 'Invalid credentials' };
        }

        // Generate tokens
        const accessToken = generateAccessToken(user._id!, user.email, user.username);
        const { token: refreshToken, tokenId } = generateRefreshToken(user._id!);

        // Create session
        const session: Session = {
            userId: user._id!,
            refreshToken: tokenId, // Store tokenId instead of full token
            deviceInfo: request.headers.get('user-agent') || 'Unknown',
            ipAddress: request.headers.get('x-forwarded-for') || 'Unknown',
            expiresAt: getRefreshTokenExpiry(),
            createdAt: new Date(),
        };

        await db.collection<Session>('sessions').insertOne(session);

        // Update last login
        await db.collection<User>('users').updateOne(
            { _id: user._id },
            { $set: { lastLoginAt: new Date() } }
        );

        logger.info({ userId: user._id, username: user.username }, 'User logged in');

        return {
            accessToken,
            refreshToken,
            user: {
                id: user._id!.toString(),
                username: user.username,
                discriminator: user.discriminator,
                email: user.email,
                emailVerified: user.emailVerified,
            },
        };
    }, {
        body: LoginSchema,
    })

    // POST /auth/refresh
    .post('/refresh', async ({ body, set }) => {
        const db = getDatabase();
        const { refreshToken } = body;

        // Verify refresh token
        const payload = verifyRefreshToken(refreshToken);

        if (!payload) {
            set.status = 401;
            return { error: 'Invalid refresh token' };
        }

        // Check session exists
        const session = await db.collection<Session>('sessions').findOne({
            userId: new ObjectId(payload.userId),
            refreshToken: payload.tokenId,
        });

        if (!session) {
            set.status = 401;
            return { error: 'Session not found' };
        }

        // Get user
        const user = await db.collection<User>('users').findOne({ _id: new ObjectId(payload.userId) });

        if (!user) {
            set.status = 401;
            return { error: 'User not found' };
        }

        // Generate new tokens
        const newAccessToken = generateAccessToken(user._id!, user.email, user.username);
        const { token: newRefreshToken, tokenId: newTokenId } = generateRefreshToken(user._id!);

        // Update session
        await db.collection<Session>('sessions').updateOne(
            { _id: session._id },
            {
                $set: {
                    refreshToken: newTokenId,
                    expiresAt: getRefreshTokenExpiry(),
                },
            }
        );

        logger.info({ userId: user._id }, 'Token refreshed');

        return {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
        };
    }, {
        body: RefreshTokenSchema,
    })

    // POST /auth/logout
    .use(authMiddleware)
    .post('/logout', async ({ auth, set }) => {
        const db = getDatabase();

        // Delete all sessions for user
        await db.collection<Session>('sessions').deleteMany({
            userId: new ObjectId(auth.userId),
        });

        logger.info({ userId: auth.userId }, 'User logged out');

        set.status = 204;
        return null;
    })

    // POST /auth/verify-email
    .post('/verify-email', async ({ body, set }) => {
        const db = getDatabase();
        const { token } = body;

        const user = await db.collection<User>('users').findOne({
            emailVerificationToken: token,
            emailVerificationExpiry: { $gt: new Date() },
        });

        if (!user) {
            set.status = 400;
            return {
                success: false,
                message: 'Invalid or expired verification token',
            };
        }

        await db.collection<User>('users').updateOne(
            { _id: user._id },
            {
                $set: { emailVerified: true },
                $unset: { emailVerificationToken: '', emailVerificationExpiry: '' },
            }
        );

        logger.info({ userId: user._id }, 'Email verified');

        return {
            success: true,
            message: 'Email verified successfully',
        };
    }, {
        body: VerifyEmailSchema,
    })

    // POST /auth/forgot-password
    .post('/forgot-password', async ({ body }) => {
        const db = getDatabase();
        const { email } = body;

        const user = await db.collection<User>('users').findOne({ email });

        if (user) {
            const resetToken = generateToken();

            await db.collection<User>('users').updateOne(
                { _id: user._id },
                {
                    $set: {
                        passwordResetToken: resetToken,
                        passwordResetExpiry: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
                    },
                }
            );

            logger.info({ userId: user._id }, 'Password reset requested');
            // TODO: Send email with reset token
        }

        // Always return success to prevent email enumeration
        return {
            message: 'If the email exists, a password reset link has been sent',
        };
    }, {
        body: ForgotPasswordSchema,
    })

    // POST /auth/reset-password
    .post('/reset-password', async ({ body, set }) => {
        const db = getDatabase();
        const { token, newPassword } = body;

        const user = await db.collection<User>('users').findOne({
            passwordResetToken: token,
            passwordResetExpiry: { $gt: new Date() },
        });

        if (!user) {
            set.status = 400;
            return {
                success: false,
                message: 'Invalid or expired reset token',
            };
        }

        const hashedPassword = await hashPassword(newPassword);

        await db.collection<User>('users').updateOne(
            { _id: user._id },
            {
                $set: { password: hashedPassword },
                $unset: { passwordResetToken: '', passwordResetExpiry: '' },
            }
        );

        // Invalidate all sessions
        await db.collection<Session>('sessions').deleteMany({ userId: user._id });

        logger.info({ userId: user._id }, 'Password reset');

        return {
            success: true,
            message: 'Password reset successfully',
        };
    }, {
        body: ResetPasswordSchema,
    })

    // POST /auth/enable-2fa
    .use(authMiddleware)
    .post('/enable-2fa', async ({ auth, set }) => {
        const db = getDatabase();

        // Generate 2FA secret
        const secret = speakeasy.generateSecret({
            name: `DiscordAlt (${auth.username})`,
        });

        // Generate QR code
        const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

        // Generate backup codes
        const backupCodes = Array.from({ length: 8 }, () =>
            Array.from({ length: 8 }, () =>
                Math.floor(Math.random() * 16).toString(16)
            ).join('')
        );

        // Save secret (not enabled yet)
        await db.collection<User>('users').updateOne(
            { _id: new ObjectId(auth.userId) },
            {
                $set: {
                    twoFactorSecret: secret.base32,
                    twoFactorBackupCodes: backupCodes,
                },
            }
        );

        logger.info({ userId: auth.userId }, '2FA setup initiated');

        return {
            secret: secret.base32,
            qrCode,
            backupCodes,
        };
    })

    // POST /auth/verify-2fa
    .use(authMiddleware)
    .post('/verify-2fa', async ({ auth, body, set }) => {
        const db = getDatabase();
        const { code } = body;

        const user = await db.collection<User>('users').findOne({ _id: new ObjectId(auth.userId) });

        if (!user || !user.twoFactorSecret) {
            set.status = 400;
            return {
                enabled: false,
                message: '2FA not set up',
            };
        }

        // Verify code
        const verified = speakeasy.totp.verify({
            secret: user.twoFactorSecret,
            encoding: 'base32',
            token: code,
        });

        if (!verified) {
            set.status = 400;
            return {
                enabled: false,
                message: 'Invalid code',
            };
        }

        // Enable 2FA
        await db.collection<User>('users').updateOne(
            { _id: user._id },
            { $set: { twoFactorEnabled: true } }
        );

        logger.info({ userId: user._id }, '2FA enabled');

        return {
            enabled: true,
            message: '2FA enabled successfully',
        };
    }, {
        body: Verify2FASchema,
    });
