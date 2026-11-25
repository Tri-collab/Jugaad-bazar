import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

// Use on any route that needs a logged-in user
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Please log in first." });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: "Account not found." });
    if (user.status === "blocked") return res.status(403).json({ message: "This account is blocked by admin." });

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Session expired. Please log in again." });
  }
}

// Use after requireAuth, e.g. requireRole("admin")
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role)
    ? next()
    : res.status(403).json({ message: "You do not have access to this." });