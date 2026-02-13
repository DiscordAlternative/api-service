import { sign, verify } from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { nanoid } from 'nanoid';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-key';
const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export interface JWTPayload {
    userId: string;
    email: string;
    username: string;
    iat?: number;
    exp?: number;
}

export interface RefreshTokenPayload {
    userId: string;
    tokenId: string;
    iat?: number;
    exp?: number;
}

export function generateAccessToken(userId: ObjectId, email: string, username: string): string {
    return sign(
        {
            userId: userId.toString(),
            email,
            username,
        },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
    );
}

export function generateRefreshToken(userId: ObjectId): { token: string; tokenId: string } {
    const tokenId = nanoid();
    const token = sign(
        {
            userId: userId.toString(),
            tokenId,
        },
        JWT_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    return { token, tokenId };
}

export function verifyAccessToken(token: string): JWTPayload | null {
    try {
        return verify(token, JWT_SECRET) as JWTPayload;
    } catch {
        return null;
    }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
    try {
        return verify(token, JWT_SECRET) as RefreshTokenPayload;
    } catch {
        return null;
    }
}

export function parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // default 15 minutes

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers: Record<string, number>= {
        s: 1,
        m: 60,
        h: 3600,
        d: 86400,
    };

    return value * (multipliers[unit] || 60);
}

export function getRefreshTokenExpiry(): Date {
    const seconds = parseExpiresIn(REFRESH_TOKEN_EXPIRES_IN);
    return new Date(Date.now() + seconds * 1000);
}
