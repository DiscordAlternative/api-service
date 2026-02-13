import { Elysia, t } from 'elysia';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../config/database';
import { logger } from '../config/logger';
import { verifyAccessToken } from '../utils/jwt';
import type { Server, ServerMember } from '../models/server';
import { CreateServerSchema, UpdateServerSchema } from '../models/server';
import type { Channel } from '../models/channel';

// Inline auth helper to avoid Elysia derive propagation issues
function getAuth(headers: Record<string, string | undefined>) {
    const authHeader = headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('Unauthorized');
    }
    const token = authHeader.replace('Bearer ', '');
    const payload = verifyAccessToken(token);
    if (!payload) {
        throw new Error('Unauthorized');
    }
    return payload;
}

export const serverRoutes = new Elysia({ prefix: '/servers' })
    // POST /servers — Create a new server
    .post('/', async ({ headers, body, set }) => {
        const auth = getAuth(headers);
        const db = getDatabase();
        const { name, icon } = body;

        const server: Server = {
            name,
            icon: icon || undefined,
            ownerId: new ObjectId(auth.userId),
            memberCount: 1,
            features: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await db.collection<Server>('servers').insertOne(server);
        const serverId = result.insertedId;

        // Add owner as first member
        await db.collection<ServerMember>('server_members').insertOne({
            serverId,
            userId: new ObjectId(auth.userId),
            nickname: undefined,
            roles: [],
            joinedAt: new Date(),
            updatedAt: new Date(),
        });

        // Create default category + text channel
        const categoryResult = await db.collection<Channel>('channels').insertOne({
            serverId,
            name: 'Metin Kanalları',
            type: 'category',
            position: 0,
            nsfw: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const channelResult = await db.collection<Channel>('channels').insertOne({
            serverId,
            name: 'genel',
            type: 'text',
            topic: 'Genel sohbet kanalı',
            position: 0,
            parentId: categoryResult.insertedId,
            nsfw: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        logger.info({ serverId, userId: auth.userId, name }, 'Server created');

        set.status = 201;
        return {
            id: serverId.toString(),
            name: server.name,
            icon: server.icon || null,
            ownerId: auth.userId,
            defaultChannelId: channelResult.insertedId.toString(),
            createdAt: server.createdAt.toISOString(),
        };
    }, {
        body: CreateServerSchema,
    })

    // GET /servers/@me — Get all servers the user is a member of
    .get('/@me', async ({ headers }) => {
        const auth = getAuth(headers);
        const db = getDatabase();

        const memberships = await db.collection<ServerMember>('server_members')
            .find({ userId: new ObjectId(auth.userId) })
            .toArray();

        if (memberships.length === 0) {
            return { servers: [] };
        }

        const serverIds = memberships.map(m => m.serverId);
        const servers = await db.collection<Server>('servers')
            .find({ _id: { $in: serverIds } })
            .toArray();

        return {
            servers: servers.map(s => ({
                id: s._id!.toString(),
                name: s.name,
                icon: s.icon || null,
                ownerId: s.ownerId.toString(),
                memberCount: s.memberCount,
                createdAt: s.createdAt.toISOString(),
            })),
        };
    })

    // GET /servers/:serverId — Get server details with channels
    .get('/:serverId', async ({ headers, params: { serverId }, set }) => {
        const auth = getAuth(headers);
        const db = getDatabase();

        if (!ObjectId.isValid(serverId)) {
            set.status = 400;
            return { error: 'Invalid server ID' };
        }

        const membership = await db.collection<ServerMember>('server_members').findOne({
            serverId: new ObjectId(serverId),
            userId: new ObjectId(auth.userId),
        });

        if (!membership) {
            set.status = 403;
            return { error: 'You are not a member of this server' };
        }

        const server = await db.collection<Server>('servers').findOne({
            _id: new ObjectId(serverId),
        });

        if (!server) {
            set.status = 404;
            return { error: 'Server not found' };
        }

        const channels = await db.collection<Channel>('channels')
            .find({ serverId: new ObjectId(serverId) })
            .sort({ position: 1 })
            .toArray();

        return {
            id: server._id!.toString(),
            name: server.name,
            icon: server.icon || null,
            banner: server.banner || null,
            description: server.description || null,
            ownerId: server.ownerId.toString(),
            memberCount: server.memberCount,
            channels: channels.map(ch => ({
                id: ch._id!.toString(),
                name: ch.name,
                type: ch.type,
                topic: ch.topic || null,
                position: ch.position,
                parentId: ch.parentId?.toString() || null,
                nsfw: ch.nsfw,
            })),
            createdAt: server.createdAt.toISOString(),
        };
    })

    // PATCH /servers/:serverId — Update server (owner only)
    .patch('/:serverId', async ({ headers, params: { serverId }, body, set }) => {
        const auth = getAuth(headers);
        const db = getDatabase();

        if (!ObjectId.isValid(serverId)) {
            set.status = 400;
            return { error: 'Invalid server ID' };
        }

        const server = await db.collection<Server>('servers').findOne({
            _id: new ObjectId(serverId),
        });

        if (!server) {
            set.status = 404;
            return { error: 'Server not found' };
        }

        if (server.ownerId.toString() !== auth.userId) {
            set.status = 403;
            return { error: 'Only the server owner can update the server' };
        }

        const updates: any = { updatedAt: new Date() };
        if (body.name) updates.name = body.name;
        if (body.icon !== undefined) updates.icon = body.icon;
        if (body.banner !== undefined) updates.banner = body.banner;
        if (body.description !== undefined) updates.description = body.description;

        await db.collection<Server>('servers').updateOne(
            { _id: new ObjectId(serverId) },
            { $set: updates }
        );

        logger.info({ serverId, userId: auth.userId }, 'Server updated');
        return { success: true, ...updates };
    }, {
        body: UpdateServerSchema,
    })

    // DELETE /servers/:serverId — Delete server (owner only)
    .delete('/:serverId', async ({ headers, params: { serverId }, set }) => {
        const auth = getAuth(headers);
        const db = getDatabase();

        if (!ObjectId.isValid(serverId)) {
            set.status = 400;
            return { error: 'Invalid server ID' };
        }

        const server = await db.collection<Server>('servers').findOne({
            _id: new ObjectId(serverId),
        });

        if (!server) {
            set.status = 404;
            return { error: 'Server not found' };
        }

        if (server.ownerId.toString() !== auth.userId) {
            set.status = 403;
            return { error: 'Only the server owner can delete the server' };
        }

        const sid = new ObjectId(serverId);
        const channelIds = (await db.collection<Channel>('channels')
            .find({ serverId: sid }).toArray()).map(c => c._id!);

        if (channelIds.length > 0) {
            await db.collection('messages').deleteMany({ channelId: { $in: channelIds } });
        }

        await db.collection('channels').deleteMany({ serverId: sid });
        await db.collection('server_members').deleteMany({ serverId: sid });
        await db.collection('server_bans').deleteMany({ serverId: sid });
        await db.collection('servers').deleteOne({ _id: sid });

        logger.info({ serverId, userId: auth.userId }, 'Server deleted');

        set.status = 204;
        return null;
    })

    // GET /servers/:serverId/channels
    .get('/:serverId/channels', async ({ headers, params: { serverId }, set }) => {
        const auth = getAuth(headers);
        const db = getDatabase();

        if (!ObjectId.isValid(serverId)) {
            set.status = 400;
            return { error: 'Invalid server ID' };
        }

        const membership = await db.collection<ServerMember>('server_members').findOne({
            serverId: new ObjectId(serverId),
            userId: new ObjectId(auth.userId),
        });

        if (!membership) {
            set.status = 403;
            return { error: 'You are not a member of this server' };
        }

        const channels = await db.collection<Channel>('channels')
            .find({ serverId: new ObjectId(serverId) })
            .sort({ position: 1 })
            .toArray();

        return {
            channels: channels.map(ch => ({
                id: ch._id!.toString(),
                name: ch.name,
                type: ch.type,
                topic: ch.topic || null,
                position: ch.position,
                parentId: ch.parentId?.toString() || null,
                nsfw: ch.nsfw,
            })),
        };
    })

    // GET /servers/:serverId/members
    .get('/:serverId/members', async ({ headers, params: { serverId }, set }) => {
        const auth = getAuth(headers);
        const db = getDatabase();

        if (!ObjectId.isValid(serverId)) {
            set.status = 400;
            return { error: 'Invalid server ID' };
        }

        const membership = await db.collection<ServerMember>('server_members').findOne({
            serverId: new ObjectId(serverId),
            userId: new ObjectId(auth.userId),
        });

        if (!membership) {
            set.status = 403;
            return { error: 'You are not a member of this server' };
        }

        const members = await db.collection<ServerMember>('server_members')
            .find({ serverId: new ObjectId(serverId) })
            .toArray();

        const userIds = members.map(m => m.userId);
        const users = await db.collection('users')
            .find({ _id: { $in: userIds } })
            .toArray();

        const userMap = new Map(users.map(u => [u._id.toString(), u]));

        return {
            members: members.map(m => {
                const user = userMap.get(m.userId.toString());
                return {
                    userId: m.userId.toString(),
                    username: user?.username || 'Unknown',
                    discriminator: user?.discriminator || '0000',
                    nickname: m.nickname || null,
                    roles: m.roles.map(r => r.toString()),
                    joinedAt: m.joinedAt.toISOString(),
                };
            }),
        };
    });
