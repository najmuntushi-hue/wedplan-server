import "dotenv/config";
import dns from "node:dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);
import { MongoClient, ObjectId } from "mongodb";
import { hashPassword } from "better-auth/crypto";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env");

  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const db = client.db("wedplan");
  const users = db.collection("user");
  const accounts = db.collection("account");

  const existing = await users.findOne({ email });
  if (existing) {
    await users.updateOne({ _id: existing._id }, { $set: { role: "admin", isBlocked: false } });
    console.log("Existing user promoted to admin:", email);
  } else {
    const _id = new ObjectId();
    const now = new Date();
    await users.insertOne({
      _id,
      name: "WedPlan Admin",
      email,
      emailVerified: true,
      image: null,
      role: "admin",
      isBlocked: false,
      subscriptionPlan: "free",
      createdAt: now,
      updatedAt: now,
    });
    await accounts.insertOne({
      userId: _id.toString(),
      accountId: _id.toString(),
      providerId: "credential",
      password: await hashPassword(password),
      createdAt: now,
      updatedAt: now,
    });
    console.log("Admin created:", email);
  }
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});