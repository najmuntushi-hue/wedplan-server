import "dotenv/config";
import dns from "node:dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import uploadRouter from "./routes/upload.js";
import servicesRouter from "./routes/services.js";
import vendorRouter from "./routes/vendor.js";
import bookingsRouter from "./routes/bookings.js";
import customerRouter from "./routes/customer.js";
import adminRouter from "./routes/admin.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import usersRouter from "./routes/users.js";
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

app.use("/upload", uploadRouter);
app.use("/services", servicesRouter);
app.use("/vendor", vendorRouter);
app.use("/bookings", bookingsRouter);
app.use("/customer", customerRouter);
app.use("/admin", adminRouter);
app.use("/users", usersRouter);

app.use(notFound);
app.use(errorHandler);

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