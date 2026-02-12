import { createClient, RedisClientType } from 'redis';
import { logger } from './logger';

const url = process.env.REDIS_URL || 'redis://localhost:6379';

let client: RedisClientType;

export async function connectRedis(): Promise<RedisClientType> {
    if (client && client.isOpen) {
        return client;
    }

    try {
        client = createClient({ url });

        client.on('error', (err) => logger.error({ err }, 'Redis error'));
        client.on('connect', () => logger.info('Redis connected'));

        await client.connect();

        return client;
    } catch (error) {
        logger.error({ error }, 'Failed to connect to Redis');
        throw error;
    }
}

export function getRedis(): RedisClientType {
    if (!client || !client.isOpen) {
        throw new Error('Redis not connected. Call connectRedis() first.');
    }
    return client;
}

export async function closeRedis(): Promise<void> {
    if (client && client.isOpen) {
        await client.quit();
        logger.info('Redis connection closed');
    }
}

// Helper functions
export async function cacheSet(key: string, value: any, ttl: number = 300): Promise<void> {
    const redis = getRedis();
    await redis.setEx(key, ttl, JSON.stringify(value));
}

export async function cacheGet<T>(key: string): Promise<T | null> {
    const redis = getRedis();
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
}

export async function cacheDel(key: string): Promise<void> {
    const redis = getRedis();
    await redis.del(key);
}
