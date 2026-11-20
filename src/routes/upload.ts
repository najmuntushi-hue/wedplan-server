import { Router } from "express";
import multer from "multer";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post("/", (req, res) => {
  upload.single("image")(req, res, async (err: any) => {
    if (err) {
      return res.status(400).json({
        message: err.code === "LIMIT_FILE_SIZE" ? "Image must be under 5MB" : err.message,
      });
    }
    if (!req.file) return res.status(400).json({ message: "No image provided" });
    if (!req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({ message: "Only image files are allowed" });
    }
    if (!process.env.IMGBB_API_KEY) {
      return res.status(500).json({ message: "IMGBB_API_KEY is not set on the server" });
    }

    try {
      const body = new URLSearchParams();
      body.append("image", req.file.buffer.toString("base64"));
      const r = await fetch(
        `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
        { method: "POST", body }
      );
      const data: any = await r.json();
      if (!data.success) {
        console.error("ImgBB error:", data);
        return res
          .status(502)
          .json({ message: data?.error?.message || "ImgBB upload failed" });
      }
      res.json({ url: data.data.url });
    } catch (e: any) {
      console.error("Upload error:", e);
      res.status(500).json({ message: "Could not reach ImgBB: " + (e.cause?.code || e.message) });
    }
  });
});

export default router;