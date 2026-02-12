import { ObjectId } from 'mongodb';
import { t } from 'elysia';

export interface Channel {
    _id?: ObjectId;
    serverId: ObjectId;
    name: string;
    type: 'text' | 'voice' | 'category';
    topic?: string;
    position: number;
    parentId?: ObjectId;
    nsfw: boolean;
    userLimit?: number;
    bitrate?: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface Message {
    _id?: ObjectId;
    channelId: ObjectId;
    authorId: ObjectId;
    content: string;
    nonce?: string;
    encrypted: boolean;
    attachments: any[];
    reactions: any[];
    replyTo?: ObjectId;
    edited: boolean;
    editedAt?: Date;
    createdAt: Date;
}

export const CreateChannelSchema = t.Object({
    name: t.String({ minLength: 1, maxLength: 100 }),
    type: t.Union([t.Literal('text'), t.Literal('voice'), t.Literal('category')]),
    parentId: t.Optional(t.String()),
    topic: t.Optional(t.String()),
    nsfw: t.Optional(t.Boolean()),
});

export const CreateMessageSchema = t.Object({
    content: t.String({ minLength: 1, maxLength: 2000 }),
    nonce: t.Optional(t.String()),
    replyTo: t.Optional(t.String()),
});
