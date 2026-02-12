import { ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import { t } from 'elysia';

export interface User {
    _id?: ObjectId;
    email: string;
    username: string;
    discriminator: string;
    password: string;
    emailVerified: boolean;
    emailVerificationToken?: string;
    emailVerificationExpiry?: Date;
    passwordResetToken?: string;
    passwordResetExpiry?: Date;
    twoFactorSecret?: string;
    twoFactorEnabled: boolean;
    twoFactorBackupCodes?: string[];
    publicKey?: string;
    lastLoginAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface Session {
    _id?: ObjectId;
    userId: ObjectId;
    refreshToken: string;
    deviceInfo: string;
    ipAddress: string;
    expiresAt: Date;
    createdAt: Date;
}

// Validation schemas
export const RegisterSchema = t.Object({
    email: t.String({ format: 'email' }),
    username: t.String({ minLength: 2, maxLength: 32 }),
    password: t.String({ minLength: 8 }),
    dateOfBirth: t.String(), // ISO 8601
});

export const LoginSchema = t.Object({
    email: t.String({ format: 'email' }),
    password: t.String(),
    captcha: t.Optional(t.String()),
});

export const RefreshTokenSchema = t.Object({
    refreshToken: t.String(),
});

export const VerifyEmailSchema = t.Object({
    token: t.String(),
});

export const ForgotPasswordSchema = t.Object({
    email: t.String({ format: 'email' }),
});

export const ResetPasswordSchema = t.Object({
    token: t.String(),
    newPassword: t.String({ minLength: 8 }),
});

export const Verify2FASchema = t.Object({
    code: t.String({ minLength: 6, maxLength: 6 }),
});

// Password utilities
const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

// Generate random discriminator
export function generateDiscriminator(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// Generate random token
export function generateToken(): string {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
