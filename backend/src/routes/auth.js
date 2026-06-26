import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import supabase from "../db/client.js";

const router = express.Router();

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const { data, error } = await supabase
    .from("users")
    .insert({ email: email.toLowerCase().trim(), password_hash: passwordHash })
    .select("id, email")
    .single();

  if (error) {
    console.error("Supabase register error:", error);
    if (error.code === "23505") {
      return res.status(409).json({ error: "Email already registered" });
    }
    return res.status(500).json({ error: "Registration failed" });
  }

  const token = jwt.sign({ userId: data.id }, process.env.JWT_SECRET, { expiresIn: "90d" });

  res.status(201).json({ token, user: { id: data.id, email: data.email } });
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const { data: user } = await supabase
    .from("users")
    .select("id, email, password_hash")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "90d" });

  res.json({ token, user: { id: user.id, email: user.email } });
});

export default router;
