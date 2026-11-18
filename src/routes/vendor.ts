import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { requireRole } from "../middleware/requireRole.js";
import { serviceSchema, serviceUpdateSchema } from "../validators/service.js";
import { paramId } from "../utils/params.js";

const router = Router();
router.use(verifyJWT, requireRole("vendor"));
const FREE_LIMIT = 3;

function isPremium(user: any) {
  return (
    user.subscriptionPlan === "premium" &&
    user.subscriptionExpiresAt &&
    new Date(user.subscriptionExpiresAt) > new Date()
  );
}

async function activeCount(vendorId: ObjectId) {
  return getDB()
    .collection("services")
    .countDocuments({ vendorId, isActive: true, status: { $ne: "rejected" } });
}

// GET /vendor/stats
router.get("/stats", async (req, res, next) => {
  try {
    const vendorId = req.user!._id;
    const services = getDB().collection("services");
    const bookings = getDB().collection("bookings");
    const [totalServices, activeServices, pendingBookings, acceptedBookings] = await Promise.all([
      services.countDocuments({ vendorId }),
      services.countDocuments({ vendorId, isActive: true, status: "approved" }),
      bookings.countDocuments({ vendorId, status: "pending" }),
      bookings.countDocuments({ vendorId, status: "accepted" }),
    ]);
    res.json({
      totalServices,
      activeServices,
      pendingBookings,
      acceptedBookings,
      plan: isPremium(req.user) ? "premium" : "free",
    });
  } catch (e) {
    next(e);
  }
});

// GET /vendor/services
router.get("/services", async (req, res, next) => {
  try {
    const services = await getDB()
      .collection("services")
      .find({ vendorId: req.user!._id })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(services);
  } catch (e) {
    next(e);
  }
});

// POST /vendor/services
router.post("/services", async (req, res, next) => {
  try {
    const parsed = serviceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }

    if (!isPremium(req.user) && (await activeCount(req.user!._id)) >= FREE_LIMIT) {
      return res.status(403).json({
        message: "Free plan allows a maximum of 3 active services. Upgrade to Premium.",
      });
    }

    const doc = {
      ...parsed.data,
      vendorId: req.user!._id,
      status: "pending",
      isActive: true,
      createdAt: new Date(),
    };
    const result = await getDB().collection("services").insertOne(doc);
    res.status(201).json({ _id: result.insertedId, ...doc });
  } catch (e) {
    next(e);
  }
});

// PATCH /vendor/services/:id  (edit info)
router.patch("/services/:id", async (req, res, next) => {
  try {
    const id = paramId(req.params.id);
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid service ID" });

    const parsed = serviceUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }

    const services = getDB().collection("services");
    const existing = await services.findOne({ _id: new ObjectId(id) });
    if (!existing) return res.status(404).json({ message: "Service not found" });
    if (String(existing.vendorId) !== String(req.user!._id)) {
      return res.status(403).json({ message: "You can only edit your own services" });
    }

    // Edited service goes back to review (admin must approve again)
    await services.updateOne(
      { _id: existing._id },
      { $set: { ...parsed.data, status: "pending" } }
    );
    res.json({ message: "Service updated and sent for review" });
  } catch (e) {
    next(e);
  }
});

// PATCH /vendor/services/:id/availability  (toggle active)
router.patch("/services/:id/availability", async (req, res, next) => {
  try {
    const id = paramId(req.params.id);
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid service ID" });

    const services = getDB().collection("services");
    const existing = await services.findOne({ _id: new ObjectId(id) });
    if (!existing) return res.status(404).json({ message: "Service not found" });
    if (String(existing.vendorId) !== String(req.user!._id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const nextActive = !existing.isActive;
    if (nextActive && !isPremium(req.user) && (await activeCount(req.user!._id)) >= FREE_LIMIT) {
      return res.status(403).json({
        message: "Free plan allows a maximum of 3 active services. Upgrade to Premium.",
      });
    }

    await services.updateOne({ _id: existing._id }, { $set: { isActive: nextActive } });
    res.json({ isActive: nextActive });
  } catch (e) {
    next(e);
  }
});

// DELETE /vendor/services/:id
router.delete("/services/:id", async (req, res, next) => {
  try {
    const id = paramId(req.params.id);
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid service ID" });

    const services = getDB().collection("services");
    const existing = await services.findOne({ _id: new ObjectId(id) });
    if (!existing) return res.status(404).json({ message: "Service not found" });
    if (String(existing.vendorId) !== String(req.user!._id)) {
      return res.status(403).json({ message: "You can only delete your own services" });
    }

    await services.deleteOne({ _id: existing._id });
    res.json({ message: "Service deleted" });
  } catch (e) {
    next(e);
  }
});

export default router;