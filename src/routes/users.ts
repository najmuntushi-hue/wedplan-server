import { Router } from "express";
import { z } from "zod";
import { getDB } from "../config/db.js";
import { verifyJWT } from "../middleware/verifyJWT.js";

const router = Router();
router.use(verifyJWT);

const profileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").optional(),
  image: z.string().url("Invalid image URL").optional(),
  businessName: z.string().trim().max(100).optional(),
});

// GET /users/me
router.get("/me", (req, res) => {
  const u = req.user!;
  res.json({
    _id: u._id,
    name: u.name,
    email: u.email,
    image: u.image,
    role: u.role,
    businessName: (u as any).businessName || "",
    subscriptionPlan: u.subscriptionPlan || "free",
  });
});

// PATCH /users/me  (only whitelisted fields)
router.patch("/me", async (req, res, next) => {
  try {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }

    const update: Record<string, any> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) update.name = parsed.data.name;
    if (parsed.data.image !== undefined) update.image = parsed.data.image;
    if (parsed.data.businessName !== undefined && req.user!.role === "vendor") {
      update.businessName = parsed.data.businessName;
    }

    await getDB().collection("user").updateOne({ _id: req.user!._id }, { $set: update });
    res.json({ message: "Profile updated" });
  } catch (e) {
    next(e);
  }
});

export default router;