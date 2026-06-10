import jwt from 'jsonwebtoken';

export function decodeToken(token: string): { userId: string } | null {
    if (!token) return null;
    try {
        return jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    } catch {
        return null;
    }
}
