import { ObjectId } from 'mongodb';
import { t } from 'elysia';

export interface UserProfile {
    _id: ObjectId; // same as userId
    username: string;
    discriminator: string;
    avatar?: string;
    banner?: string;
    bio?: string;
    customStatus?: string;
    badges: string[];
    createdAt: Date;
    updatedAt: Date;
}

export interface UserSettings {
    _id?: ObjectId;
    userId: ObjectId;
    theme: 'dark' | 'light';
    language: string;
    notifications: {
        email: boolean;
        push: boolean;
        mentionOnly: boolean;
    };
    privacy: {
        showOnlineStatus: boolean;
        allowDMs: 'everyone' | 'friends' | 'none';
    };
    createdAt: Date;
    updatedAt: Date;
}

// Validation schemas
export const UpdateProfileSchema = t.Object({
    username: t.Optional(t.String({ minLength: 2, maxLength: 32 })),
    bio: t.Optional(t.String({ maxLength: 190 })),
    customStatus: t.Optional(t.String({ maxLength: 128 })),
});

export const UpdateSettingsSchema = t.Object({
    theme: t.Optional(t.Union([t.Literal('dark'), t.Literal('light')])),
    language: t.Optional(t.String()),
    notifications: t.Optional(
        t.Object({
            email: t.Optional(t.Boolean()),
            push: t.Optional(t.Boolean()),
            mentionOnly: t.Optional(t.Boolean()),
        })
    ),
    privacy: t.Optional(
        t.Object({
            showOnlineStatus: t.Optional(t.Boolean()),
            allowDMs: t.Optional(t.Union([t.Literal('everyone'), t.Literal('friends'), t.Literal('none')])),
        })
    ),
});

export const SearchUsersSchema = t.Object({
    q: t.String({ minLength: 1 }),
    limit: t.Optional(t.Number({ minimum: 1, maximum: 50 })),
});
