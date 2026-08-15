import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import submissionRoutes from "./routes/submissions.js";
import reviewRoutes from "./routes/reviews.js";
import integrationRoutes from "./routes/integrations.js";

const app = express();

app.use(cors({
    origin: true
}));
app.use(express.json());

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/review", reviewRoutes);          // review page — no /api prefix (user-facing URL)
app.use("/api/reviews", reviewRoutes);          // review completion endpoint

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Engram backend running on port ${PORT}`);
});
