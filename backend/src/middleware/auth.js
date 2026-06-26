import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  // Accept token from Authorization header OR ?jwt= query param (for OAuth redirects)
  const header = req.headers.authorization;
  const raw = header?.startsWith("Bearer ")
    ? header.slice(7)
    : req.query.jwt;

  if (!raw) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = jwt.verify(raw, process.env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
