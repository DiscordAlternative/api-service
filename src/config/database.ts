import { MongoClient, Db } from 'mongodb';
import { logger } from './logger';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/discord-alt';

let client: MongoClient;
let db: Db;

export async function connectDatabase(): Promise<Db> {
    if (db) {
        return db;
    }

    try {
        client = new MongoClient(uri);
        await client.connect();
        db = client.db();

        logger.info({ uri: uri.replace(/\/\/.*@/, '//<credentials>@') }, 'MongoDB connected');

        // Create indexes
        await createIndexes();

        return db;
    } catch (error) {
        logger.error({ error }, 'Failed to connect to MongoDB');
        throw error;
    }
}

async function createIndexes() {
    try {
        // Users collection indexes
        await db.collection('users').createIndex({ email: 1 }, { unique: true });
        await db.collection('users').createIndex({ username: 1 }, { unique: true });
        await db.collection('users').createIndex({ emailVerificationToken: 1 });

        // Sessions collection
        await db.collection('sessions').createIndex({ userId: 1 });
        await db.collection('sessions').createIndex({ refreshToken: 1 });
        await db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

        // Servers collection
        await db.collection('servers').createIndex({ ownerId: 1, createdAt: -1 });

        // Server members
        await db.collection('server_members').createIndex({ serverId: 1, userId: 1 }, { unique: true });
        await db.collection('server_members').createIndex({ userId: 1 });

        // Channels
        await db.collection('channels').createIndex({ serverId: 1, position: 1 });

        // Messages
        await db.collection('messages').createIndex({ channelId: 1, createdAt: -1 });
        await db.collection('messages').createIndex({ authorId: 1, createdAt: -1 });
        await db.collection('messages').createIndex({ nonce: 1 }); // Deduplication
        await db.collection('messages').createIndex({ content: 'text' }); // Full-text search

        // Roles
        await db.collection('roles').createIndex({ serverId: 1, position: 1 });

        logger.info('Database indexes created');
    } catch (error) {
        logger.warn({ error }, 'Some indexes may already exist');
    }
}

export function getDatabase(): Db {
    if (!db) {
        throw new Error('Database not connected. Call connectDatabase() first.');
    }
    return db;
}

export async function closeDatabase(): Promise<void> {
    if (client) {
        await client.close();
        logger.info('MongoDB connection closed');
    }
}
