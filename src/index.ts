import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "WedPlan server is running" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});