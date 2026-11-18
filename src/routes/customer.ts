import { Router } from "express";
import { getDB } from "../config/db.js";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();
router.use(verifyJWT, requireRole("customer"));

// GET /customer/stats
router.get("/stats", async (req, res, next) => {
  try {
    const bookings = getDB().collection("bookings");
    const customerId = req.user!._id;
    const [total, pending, accepted, rejected] = await Promise.all([
      bookings.countDocuments({ customerId }),
      bookings.countDocuments({ customerId, status: "pending" }),
      bookings.countDocuments({ customerId, status: "accepted" }),
      bookings.countDocuments({ customerId, status: "rejected" }),
    ]);
    res.json({ total, pending, accepted, rejected });
  } catch (e) {
    next(e);
  }
});

export default router;