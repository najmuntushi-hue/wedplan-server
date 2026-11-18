import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { requireRole } from "../middleware/requireRole.js";
import { paramId } from "../utils/params.js";

const router = Router();
router.use(verifyJWT, requireRole("admin"));

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// GET /admin/stats
router.get("/stats", async (_req, res, next) => {
  try {
    const db = getDB();
    const users = db.collection("user");
    const [totalUsers, totalVendors, totalCustomers, totalServices, pendingServices, totalTransactions] =
      await Promise.all([
        users.countDocuments({}),
        users.countDocuments({ role: "vendor" }),
        users.countDocuments({ role: "customer" }),
        db.collection("services").countDocuments({}),
        db.collection("services").countDocuments({ status: "pending" }),
        db.collection("transactions").countDocuments({}),
      ]);
    res.json({ totalUsers, totalVendors, totalCustomers, totalServices, pendingServices, totalTransactions });
  } catch (e) {
    next(e);
  }
});

// GET /admin/users?search=&role=
router.get("/users", async (req, res, next) => {
  try {
    const { search, role } = req.query as Record<string, string>;
    const filter: Record<string, any> = {};
    if (role && ["customer", "vendor", "admin"].includes(role)) filter.role = role;
    if (search) {
      const r = { $regex: esc(search), $options: "i" };
      filter.$or = [{ name: r }, { email: r }];
    }
    const users = await getDB()
      .collection("user")
      .find(filter)
      .project({ name: 1, email: 1, image: 1, role: 1, isBlocked: 1, businessName: 1, subscriptionPlan: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(users);
  } catch (e) {
    next(e);
  }
});

// PATCH /admin/users/:id/block  body: { blocked: boolean }
router.patch("/users/:id/block", async (req, res, next) => {
  try {
    const id = paramId(req.params.id);
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid user ID" });
    if (id === String(req.user!._id)) return res.status(400).json({ message: "You cannot block yourself" });

    const users = getDB().collection("user");
    const target = await users.findOne({ _id: new ObjectId(id) });
    if (!target) return res.status(404).json({ message: "User not found" });
    if (target.role === "admin") return res.status(403).json({ message: "Cannot block an admin" });

    const blocked = !!req.body?.blocked;
    await users.updateOne({ _id: target._id }, { $set: { isBlocked: blocked } });
    if (blocked) {
      await getDB().collection("session").deleteMany({ userId: String(target._id) });
    }
    res.json({ isBlocked: blocked });
  } catch (e) {
    next(e);
  }
});

// GET /admin/services?search=&status=&category=
router.get("/services", async (req, res, next) => {
  try {
    const { search, status, category } = req.query as Record<string, string>;
    const filter: Record<string, any> = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (search) filter.serviceName = { $regex: esc(search), $options: "i" };

    const services = await getDB()
      .collection("services")
      .aggregate([
        { $match: filter },
        { $sort: { createdAt: -1 } },
        { $lookup: { from: "user", localField: "vendorId", foreignField: "_id", as: "vendor" } },
        { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
        { $project: { serviceName: 1, category: 1, price: 1, location: 1, images: 1, status: 1, isActive: 1, createdAt: 1, "vendor.name": 1, "vendor.businessName": 1 } },
      ])
      .toArray();
    res.json(services);
  } catch (e) {
    next(e);
  }
});

// PATCH /admin/services/:id/status  body: { status: approved|rejected|pending }
router.patch("/services/:id/status", async (req, res, next) => {
  try {
    const id = paramId(req.params.id);
    const { status } = req.body as { status?: string };
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid service ID" });
    if (!status || !["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const result = await getDB()
      .collection("services")
      .updateOne({ _id: new ObjectId(id) }, { $set: { status } });
    if (result.matchedCount === 0) return res.status(404).json({ message: "Service not found" });
    res.json({ status });
  } catch (e) {
    next(e);
  }
});

// DELETE /admin/services/:id
router.delete("/services/:id", async (req, res, next) => {
  try {
    const id = paramId(req.params.id);
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid service ID" });
    const result = await getDB().collection("services").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ message: "Service not found" });
    res.json({ message: "Service deleted" });
  } catch (e) {
    next(e);
  }
});

// GET /admin/transactions (read-only, no edit endpoint on purpose)
router.get("/transactions", async (_req, res, next) => {
  try {
    const tx = await getDB()
      .collection("transactions")
      .aggregate([
        { $sort: { createdAt: -1 } },
        { $lookup: { from: "user", localField: "vendorId", foreignField: "_id", as: "vendor" } },
        { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
        { $project: { plan: 1, amount: 1, currency: 1, status: 1, createdAt: 1, "vendor.name": 1, "vendor.email": 1, "vendor.businessName": 1 } },
      ])
      .toArray();
    res.json(tx);
  } catch (e) {
    next(e);
  }
});

export default router;