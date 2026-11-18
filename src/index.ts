import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import uploadRouter from "./routes/upload.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

// Stripe webhook route pore ekhane boshbe (express.json() er AGE)
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "WedPlan server is running" });
});

app.use("/upload", uploadRouter);

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});