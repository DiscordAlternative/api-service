import { Elysia } from 'elysia';

export const roleRoutes = new Elysia({ prefix: '/roles' })
    .get('/', () => ({ message: 'Role routes - TBD' }));
