import { Elysia } from 'elysia';

export const channelRoutes = new Elysia({ prefix: '/channels' })
    .get('/', () => ({ message: 'Channel routes - TBD' }));
