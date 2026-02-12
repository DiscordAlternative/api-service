import { ObjectId } from 'mongodb';
import { t } from 'elysia';

export enum Permissions {
    VIEW_CHANNELS = 1 << 0,
    SEND_MESSAGES = 1 << 1,
    MANAGE_MESSAGES = 1 << 5,
    KICK_MEMBERS = 1 << 15,
    BAN_MEMBERS = 1 << 16,
    ADMINISTRATOR = 1 << 17,
}

export interface Role {
    _id?: ObjectId;
    serverId: ObjectId;
    name: string;
    color: string;
    position: number;
    permissions: number;
    mentionable: boolean;
    hoisted: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export const CreateRoleSchema = t.Object({
    name: t.String({ minLength: 1, maxLength: 100 }),
    color: t.Optional(t.String()),
    permissions: t.Number(),
    mentionable: t.Optional(t.Boolean()),
    hoisted: t.Optional(t.Boolean()),
});

export function hasPermission(userPerms: number, required: Permissions): boolean {
    if (userPerms & Permissions.ADMINISTRATOR) return true;
    return (userPerms & required) === required;
}
