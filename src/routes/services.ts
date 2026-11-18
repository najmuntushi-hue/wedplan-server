import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

const router = Router();

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET /services?search=&category=&location=&sort=asc|desc&page=&limit=
router.get("/", async (req, res, next) => {
  try {
    const { search, category, location, sort, limit } = req.query as Record<string, string>;

    const filter: Record<string, any> = { status: "approved", isActive: true };
    if (search) filter.serviceName = { $regex: escapeRegex(search), $options: "i" };
    if (category) filter.category = category;
    if (location) filter.location = { $regex: escapeRegex(location), $options: "i" };

    let cursor = getDB().collection("services").find(filter);
    if (sort === "asc") cursor = cursor.sort({ price: 1 });
    else if (sort === "desc") cursor = cursor.sort({ price: -1 });
    else cursor = cursor.sort({ createdAt: -1 });

    const lim = Math.min(Number(limit) || 100, 100);
    const services = await cursor.limit(lim).toArray();

    // Vendor info join
    const vendorIds = [...new Set(services.map((s) => String(s.vendorId)))].map((id) => new ObjectId(id));
    const vendors = await getDB()
      .collection("user")
      .find({ _id: { $in: vendorIds } })
      .project({ name: 1, image: 1, businessName: 1, subscriptionPlan: 1 })
      .toArray();
    const vMap = new Map(vendors.map((v) => [String(v._id), v]));

    res.json(
      services.map((s) => ({
        ...s,
        vendor: vMap.get(String(s.vendorId)) || null,
      }))
    );
  } catch (e) {
    next(e);
  }
});

// GET /services/:id
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid service ID" });

    const service = await getDB().collection("services").findOne({ _id: new ObjectId(id) });
    if (!service || service.status !== "approved" || !service.isActive) {
      return res.status(404).json({ message: "Service not found or unavailable" });
    }

    const vendor = await getDB()
      .collection("user")
      .findOne(
        { _id: new ObjectId(String(service.vendorId)) },
        { projection: { name: 1, image: 1, businessName: 1, subscriptionPlan: 1 } }
      );

    res.json({ ...service, vendor });
  } catch (e) {
    next(e);
  }
});

export default router;