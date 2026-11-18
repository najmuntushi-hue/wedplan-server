import { Router } from "express";
import multer from "multer";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post("/", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No image provided" });
  if (!req.file.mimetype.startsWith("image/")) {
    return res.status(400).json({ message: "Only image files are allowed" });
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
      return res.status(502).json({ message: "ImgBB upload failed" });
    }
    res.json({ url: data.data.url });
  } catch {
    res.status(500).json({ message: "Upload error" });
  }
});

export default router;