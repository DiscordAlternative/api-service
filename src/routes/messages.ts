import { Elysia } from 'elysia';

export const messageRoutes = new Elysia({ prefix: '/messages' })
    .get('/', () => ({ message: 'Message routes - TBD' }));
