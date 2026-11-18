import type { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

let JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!JWKS) JWKS = createRemoteJWKSet(new URL(process.env.JWKS_URL!));
  return JWKS;
}

export interface AuthUser {
  _id: ObjectId;
  name: string;
  email: string;
  image?: string;
  role: "customer" | "vendor" | "admin";
  isBlocked?: boolean;
  subscriptionPlan?: string;
  subscriptionExpiresAt?: Date | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function verifyJWT(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: token missing" });
  }

  try {
    const token = header.split(" ")[1];
    const { payload } = await jwtVerify(token, getJWKS());

    const id = (payload.id || payload.sub) as string;
    if (!id || !ObjectId.isValid(id)) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const user = await getDB().collection("user").findOne({ _id: new ObjectId(id) });
    if (!user) return res.status(401).json({ message: "User not found" });
    if (user.isBlocked) return res.status(403).json({ message: "Your account is blocked" });

    req.user = user as unknown as AuthUser;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}