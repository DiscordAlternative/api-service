import { Elysia } from 'elysia';

export const serverRoutes = new Elysia({ prefix: '/servers' })
    .get('/', () => ({ message: 'Server routes - TBD' }));
