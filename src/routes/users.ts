import { Elysia, t } from 'elysia';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../config/database';
import { cacheGet, cacheSet, cacheDel } from '../config/redis';
import { logger } from '../config/logger';
import { authMiddleware, AuthContext } from '../middleware/auth';
import { User } from '../models/user';
import {
    UserProfile,
    UserSettings,
    UpdateProfileSchema,
    UpdateSettingsSchema,
    SearchUsersSchema,
} from '../models/user-profile';

export const userRoutes = new Elysia({ prefix: '/users' })
    // GET /users/@me
    .use(authMiddleware)
    .get('/@me', async ({ auth }) => {
        const db = getDatabase();

        // Try cache first
        const cacheKey = `cache:user:${auth.userId}`;
        const cached = await cacheGet<any>(cacheKey);

        if (cached) {
            return cached;
        }

        const user = await db.collection<User>('users').findOne({ _id: new ObjectId(auth.userId) });

        if (!user) {
            throw new Error('User not found');
        }

        const profile = await db.collection<UserProfile>('user_profiles').findOne({ _id: user._id });

        const result = {
            id: user._id!.toString(),
            username: user.username,
            discriminator: user.discriminator,
            email: user.email,
            avatar: profile?.avatar,
            banner: profile?.banner,
            bio: profile?.bio,
            customStatus: profile?.customStatus,
            badges: profile?.badges || [],
            emailVerified: user.emailVerified,
            twoFactorEnabled: user.twoFactorEnabled,
            createdAt: user.createdAt.toISOString(),
        };

        // Cache for 5 minutes
        await cacheSet(cacheKey, result, 300);

        return result;
    })

    // PATCH /users/@me
    .use(authMiddleware)
    .patch('/@me', async ({ auth, body, set }) => {
        const db = getDatabase();

        const updates: any = {};

        if (body.username) {
            // Check if username is taken
            const existing = await db.collection<User>('users').findOne({
                username: body.username,
                _id: { $ne: new ObjectId(auth.userId) },
            });

            if (existing) {
                set.status = 409;
                return { error: 'Username already taken' };
            }

            await db.collection<User>('users').updateOne(
                { _id: new ObjectId(auth.userId) },
                { $set: { username: body.username, updatedAt: new Date() } }
            );
        }

        if (body.bio !== undefined) updates.bio = body.bio;
        if (body.customStatus !== undefined) updates.customStatus = body.customStatus;

        if (Object.keys(updates).length > 0) {
            updates.updatedAt = new Date();

            await db.collection<UserProfile>('user_profiles').updateOne(
                { _id: new ObjectId(auth.userId) },
                { $set: updates },
                { upsert: true }
            );
        }

        // Invalidate cache
        await cacheDel(`cache:user:${auth.userId}`);

        logger.info({ userId: auth.userId }, 'Profile updated');

        return { success: true, ...updates };
    }, {
        body: UpdateProfileSchema,
    })

    // POST /users/@me/avatar
    .use(authMiddleware)
    .post('/@me/avatar', async ({ auth, body, set }) => {
        const db = getDatabase();

        // TODO: In future, upload to MinIO/S3 and get URL
        // For now, we'll store base64 data URL
        const avatarUrl = `data:image/png;base64,placeholder`;

        await db.collection<UserProfile>('user_profiles').updateOne(
            { _id: new ObjectId(auth.userId) },
            { $set: { avatar: avatarUrl, updatedAt: new Date() } },
            { upsert: true }
        );

        await cacheDel(`cache:user:${auth.userId}`);

        logger.info({ userId: auth.userId }, 'Avatar updated');

        return { avatarUrl };
    })

    // GET /users/:userId
    .get('/:userId', async ({ params: { userId }, set }) => {
        const db = getDatabase();

        if (!ObjectId.isValid(userId)) {
            set.status = 400;
            return { error: 'Invalid user ID' };
        }

        const cacheKey = `cache:user:${userId}`;
        const cached = await cacheGet<any>(cacheKey);

        if (cached) {
            // Remove sensitive data
            delete cached.email;
            delete cached.emailVerified;
            delete cached.twoFactorEnabled;
            return cached;
        }

        const user = await db.collection<User>('users').findOne({ _id: new ObjectId(userId) });

        if (!user) {
            set.status = 404;
            return { error: 'User not found' };
        }

        const profile = await db.collection<UserProfile>('user_profiles').findOne({ _id: user._id });

        const result = {
            id: user._id!.toString(),
            username: user.username,
            discriminator: user.discriminator,
            avatar: profile?.avatar,
            banner: profile?.banner,
            bio: profile?.bio,
            customStatus: profile?.customStatus,
            badges: profile?.badges || [],
            createdAt: user.createdAt.toISOString(),
        };

        await cacheSet(cacheKey, result, 300);

        return result;
    })

    // GET /users/@me/settings
    .use(authMiddleware)
    .get('/@me/settings', async ({ auth }) => {
        const db = getDatabase();

        const settings = await db.collection<UserSettings>('user_settings').findOne({
            userId: new ObjectId(auth.userId),
        });

        if (!settings) {
            // Return defaults
            return {
                theme: 'dark',
                language: 'en',
                notifications: {
                    email: true,
                    push: true,
                    mentionOnly: false,
                },
                privacy: {
                    showOnlineStatus: true,
                    allowDMs: 'everyone',
                },
            };
        }

        return {
            theme: settings.theme,
            language: settings.language,
            notifications: settings.notifications,
            privacy: settings.privacy,
        };
    })

    // PATCH /users/@me/settings
    .use(authMiddleware)
    .patch('/@me/settings', async ({ auth, body }) => {
        const db = getDatabase();

        const updates: any = { updatedAt: new Date() };

        if (body.theme) updates.theme = body.theme;
        if (body.language) updates.language = body.language;
        if (body.notifications) {
            const current = await db.collection<UserSettings>('user_settings').findOne({
                userId: new ObjectId(auth.userId),
            });

            updates.notifications = {
                ...(current?.notifications || { email: true, push: true, mentionOnly: false }),
                ...body.notifications,
            };
        }
        if (body.privacy) {
            const current = await db.collection<UserSettings>('user_settings').findOne({
                userId: new ObjectId(auth.userId),
            });

            updates.privacy = {
                ...(current?.privacy || { showOnlineStatus: true, allowDMs: 'everyone' }),
                ...body.privacy,
            };
        }

        await db.collection<UserSettings>('user_settings').updateOne(
            { userId: new ObjectId(auth.userId) },
            { $set: updates },
            { upsert: true }
        );

        logger.info({ userId: auth.userId }, 'Settings updated');

        return { success: true };
    }, {
        body: UpdateSettingsSchema,
    })

    // GET /users/search
    .get('/search', async ({ query, set }) => {
        const db = getDatabase();

        const searchTerm = query.q as string;
        const limit = parseInt(query.limit as string) || 20;

        if (!searchTerm || searchTerm.length < 1) {
            set.status = 400;
            return { error: 'Search query required' };
        }

        const users = await db
            .collection<User>('users')
            .find({
                $or: [
                    { username: { $regex: searchTerm, $options: 'i' } },
                    { email: { $regex: searchTerm, $options: 'i' } },
                ],
            })
            .limit(limit)
            .toArray();

        const profiles = await db
            .collection<UserProfile>('user_profiles')
            .find({ _id: { $in: users.map((u) => u._id!) } })
            .toArray();

        const profileMap = new Map(profiles.map((p) => [p._id.toString(), p]));

        return {
            users: users.map((user) => {
                const profile = profileMap.get(user._id!.toString());
                return {
                    id: user._id!.toString(),
                    username: user.username,
                    discriminator: user.discriminator,
                    avatar: profile?.avatar,
                };
            }),
        };
    });
