import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { requireRole } from "../middleware/requireRole.js";
import { bookingSchema } from "../validators/booking.js";
import { paramId } from "../utils/params.js";

const router = Router();
router.use(verifyJWT);

// POST /bookings (customer only)
router.post("/", requireRole("customer"), async (req, res, next) => {
  try {
    const parsed = bookingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    const { serviceId, eventDate, eventLocation, message } = parsed.data;
    if (!ObjectId.isValid(serviceId)) {
      return res.status(400).json({ message: "Invalid service ID" });
    }

    const db = getDB();
    const service = await db.collection("services").findOne({ _id: new ObjectId(serviceId) });
    if (!service || service.status !== "approved" || !service.isActive) {
      return res.status(404).json({ message: "Service not found or unavailable" });
    }

    if (String(service.vendorId) === String(req.user!._id)) {
      return res.status(403).json({ message: "You cannot book your own service" });
    }

    // Duplicate active booking: same customer + service + same day
    const dayStart = new Date(eventDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const duplicate = await db.collection("bookings").findOne({
      serviceId: service._id,
      customerId: req.user!._id,
      eventDate: { $gte: dayStart, $lt: dayEnd },
      status: { $in: ["pending", "accepted"] },
    });
    if (duplicate) {
      return res
        .status(409)
        .json({ message: "You already have an active booking request for this service and date" });
    }

    const doc = {
      serviceId: service._id,
      vendorId: service.vendorId,
      customerId: req.user!._id,
      eventDate,
      eventLocation,
      message,
      status: "pending",
      createdAt: new Date(),
    };
    const result = await db.collection("bookings").insertOne(doc);
    res.status(201).json({ _id: result.insertedId, ...doc });
  } catch (e) {
    next(e);
  }
});

// GET /bookings/mine (customer: own bookings)
router.get("/mine", requireRole("customer"), async (req, res, next) => {
  try {
    const bookings = await getDB()
      .collection("bookings")
      .aggregate([
        { $match: { customerId: req.user!._id } },
        { $sort: { createdAt: -1 } },
        { $lookup: { from: "services", localField: "serviceId", foreignField: "_id", as: "service" } },
        { $unwind: { path: "$service", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "user", localField: "vendorId", foreignField: "_id", as: "vendor" } },
        { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            serviceId: 1, vendorId: 1, eventDate: 1, eventLocation: 1, message: 1, status: 1, createdAt: 1,
            "service.serviceName": 1, "service.images": 1, "service.price": 1, "service.category": 1,
            "vendor.name": 1, "vendor.businessName": 1, "vendor.image": 1,
          },
        },
      ])
      .toArray();
    res.json(bookings);
  } catch (e) {
    next(e);
  }
});

// GET /bookings/vendor (vendor: requests for own services)
router.get("/vendor", requireRole("vendor"), async (req, res, next) => {
  try {
    const bookings = await getDB()
      .collection("bookings")
      .aggregate([
        { $match: { vendorId: req.user!._id } },
        { $sort: { createdAt: -1 } },
        { $lookup: { from: "services", localField: "serviceId", foreignField: "_id", as: "service" } },
        { $unwind: { path: "$service", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "user", localField: "customerId", foreignField: "_id", as: "customer" } },
        { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            serviceId: 1, customerId: 1, eventDate: 1, eventLocation: 1, message: 1, status: 1, createdAt: 1,
            "service.serviceName": 1, "service.images": 1, "service.price": 1,
            "customer.name": 1, "customer.email": 1, "customer.image": 1,
          },
        },
      ])
      .toArray();
    res.json(bookings);
  } catch (e) {
    next(e);
  }
});

// PATCH /bookings/:id/status (vendor: accept / reject, pending only)
router.patch("/:id/status", requireRole("vendor"), async (req, res, next) => {
  try {
    const id = paramId(req.params.id);
    const { status } = req.body as { status?: string };
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid booking ID" });
    if (status !== "accepted" && status !== "rejected") {
      return res.status(400).json({ message: "Status must be accepted or rejected" });
    }

    const bookings = getDB().collection("bookings");
    const booking = await bookings.findOne({ _id: new ObjectId(id) });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (String(booking.vendorId) !== String(req.user!._id)) {
      return res.status(403).json({ message: "You can only manage your own booking requests" });
    }
    if (booking.status !== "pending") {
      return res.status(409).json({ message: `This request is already ${booking.status}` });
    }

    const result = await bookings.updateOne(
      { _id: booking._id, status: "pending" },
      { $set: { status, updatedAt: new Date() } }
    );
    if (result.modifiedCount === 0) {
      return res.status(409).json({ message: "This request was already processed" });
    }
    res.json({ message: `Booking ${status}`, status });
  } catch (e) {
    next(e);
  }
});

// PATCH /bookings/:id/cancel (customer: cancel own pending)
router.patch("/:id/cancel", requireRole("customer"), async (req, res, next) => {
  try {
    const id = paramId(req.params.id);
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid booking ID" });

    const bookings = getDB().collection("bookings");
    const booking = await bookings.findOne({ _id: new ObjectId(id) });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (String(booking.customerId) !== String(req.user!._id)) {
      return res.status(403).json({ message: "You can only cancel your own bookings" });
    }
    if (booking.status !== "pending") {
      return res.status(409).json({ message: `Cannot cancel a ${booking.status} booking` });
    }

    const result = await bookings.updateOne(
      { _id: booking._id, status: "pending" },
      { $set: { status: "cancelled", updatedAt: new Date() } }
    );
    if (result.modifiedCount === 0) {
      return res.status(409).json({ message: "This booking can no longer be cancelled" });
    }
    res.json({ message: "Booking cancelled", status: "cancelled" });
  } catch (e) {
    next(e);
  }
});

export default router;