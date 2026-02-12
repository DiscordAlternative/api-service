import { Elysia } from 'elysia';
import { verifyAccessToken, JWTPayload } from '../utils/jwt';
import { logger } from '../config/logger';

export interface AuthContext {
    userId: string;
    email: string;
    username: string;
}

export const authMiddleware = new Elysia()
    .derive(async ({ headers, set }) => {
        const authHeader = headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            set.status = 401;
            throw new Error('Unauthorized');
        }

        const token = authHeader.replace('Bearer ', '');
        const payload = verifyAccessToken(token);

        if (!payload) {
            set.status = 401;
            throw new Error('Unauthorized');
        }

        logger.debug({ userId: payload.userId }, 'Authenticated request');

        return {
            auth: {
                userId: payload.userId,
                email: payload.email,
                username: payload.username,
            } as AuthContext,
        };
    });
