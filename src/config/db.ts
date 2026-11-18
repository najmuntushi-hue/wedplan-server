import { MongoClient, Db } from "mongodb";

let db: Db;

export async function connectDB(): Promise<Db> {
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set in .env");

  const client = new MongoClient(uri);
  await client.connect();
  db = client.db("wedplan");
  console.log("MongoDB connected");
  return db;
}

export function getDB(): Db {
  if (!db) throw new Error("Database not connected yet");
  return db;
}