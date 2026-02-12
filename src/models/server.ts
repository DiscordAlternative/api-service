import { ObjectId } from 'mongodb';
import { t } from 'elysia';

export interface Server {
    _id?: ObjectId;
    name: string;
    icon?: string;
    banner?: string;
    description?: string;
    ownerId: ObjectId;
    vanityUrl?: string;
  member Count: number;
features: string[];
createdAt: Date;
updatedAt: Date;
}

export interface ServerMember {
    _id?: ObjectId;
    serverId: ObjectId;
    userId: ObjectId;
    nickname?: string;
    roles: ObjectId[];
    joinedAt: Date;
    updatedAt: Date;
}

export interface ServerBan {
    _id?: ObjectId;
    serverId: ObjectId;
    userId: ObjectId;
    reason?: string;
    bannedBy: ObjectId;
    createdAt: Date;
}

export const CreateServerSchema = t.Object({
    name: t.String({ minLength: 2, maxLength: 100 }),
    icon: t.Optional(t.String()),
});

export const UpdateServerSchema = t.Object({
    name: t.Optional(t.String({ minLength: 2, maxLength: 100 })),
    icon: t.Optional(t.String()),
    banner: t.Optional(t.String()),
    description: t.Optional(t.String({ maxLength: 500 })),
});

export const BanMemberSchema = t.Object({
    userId: t.String(),
    reason: t.Optional(t.String()),
    deleteMessageDays: t.Optional(t.Number({ minimum: 0, maximum: 7 })),
});
