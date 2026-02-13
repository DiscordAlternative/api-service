import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { cors } from '@elysiajs/cors';
import { connectDatabase } from './config/database';
import { connectRedis } from './config/redis';
import { logger } from './config/logger';

// Routes (will be created later)
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { serverRoutes } from './routes/servers';
import { roleRoutes } from './routes/roles';
import { channelRoutes } from './routes/channels';
import { messageRoutes } from './routes/messages';

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-key';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// Initialize database connections
await connectDatabase();
await connectRedis();

const app = new Elysia()
    // CORS configuration
    .use(
        cors({
            origin: CORS_ORIGIN,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            credentials: true,
        })
    )

    // JWT plugin
    .use(
        jwt({
            name: 'jwt',
            secret: JWT_SECRET,
            exp: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
        })
    )

    // Health check
    .get('/health', () => ({
        status: 'ok',
        timestamp: new Date().toISOString(),
    }))

    // API Routes
    .use(authRoutes)
    .use(userRoutes)
    .use(serverRoutes)
    .use(roleRoutes)
    .use(channelRoutes)
    .use(messageRoutes)

    // Global error handler
    // Global error handler
    .onError(({ code, error, set }) => {
        const err = error as any;
        logger.error({ code, error: err.message, stack: err.stack }, 'Request error');

        if (code === 'VALIDATION') {
            set.status = 422;
            return {
                error: 'Validation Error',
                message: err.message,
            };
        }

        if (code === 'NOT_FOUND') {
            set.status = 404;
            return {
                error: 'Not Found',
                message: 'The requested resource was not found',
            };
        }

        if (err.message === 'Unauthorized') {
            set.status = 401;
            return {
                error: 'Unauthorized',
                message: 'Invalid or expired token',
            };
        }

        // Generic server error
        set.status = 500;
        return {
            error: 'Internal Server Error',
            message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
        };
    })

    .listen(PORT);

logger.info(
    { port: PORT, hostname: app.server?.hostname },
    `🦊 API Service is running at ${app.server?.hostname}:${app.server?.port}`
);
