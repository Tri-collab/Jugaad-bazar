import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dns from "node:dns";
import authRoutes from "./routes/auth.js";
import listingRoutes from "./routes/listings.js";
import requestRoutes from "./routes/requests.js";
import needRoutes from "./routes/needs.js";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const app = express();

// Allow the React frontend (comma separated list in CLIENT_URL)
const origins = (process.env.CLIENT_URL || "http://localhost:5173").split(",").map((s) => s.trim());
app.use(cors({ origin: origins }));
app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "Jugaad Bazar API",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    time: new Date().toISOString(),
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/needs", needRoutes);

// 404 + central error handler
app.use((req, res) => res.status(404).json({ message: "Route not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Server error" });
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`API running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  })