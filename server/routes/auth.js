import { Router } from "express";
import bcrypt from "bcryptjs";
import User, { STUDENT_TYPES } from "../models/User.js";
import { requireAuth, signToken } from "../middleware/auth.js";

const router = Router();

// SIMULATED college verification: only checks the email domain (.edu, .ac.in, .edu.in)
const isCollegeEmail = (email) => /@[\w.-]+\.(edu|ac\.in|edu\.in)$/i.test(email);

// POST /api/auth/register
router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password, college, city, studentType, role } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: "Name is required." });
    if (!/^\S+@\S+\.\S+$/.test(email || "")) return res.status(400).json({ message: "Enter a valid email." });
    if (!password || password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters." });
    if (studentType && !STUDENT_TYPES.includes(studentType)) return res.status(400).json({ message: "Invalid student type." });
    if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: "This email is already registered." });

    const verified = isCollegeEmail(email);
    const user = await User.create({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: role === "seller" ? "seller" : "student", // admin can never be self-registered
      verified,
      college: verified ? college?.trim() || "Verified College" : "Independent",
      city: city?.trim() || "",
      studentType: studentType || "College",
    });

    res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase() });

    if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
      return res.status(401).json({ message: "Email or password is incorrect." });
    }
    if (user.status === "blocked") return res.status(403).json({ message: "This account is blocked by admin." });

    res.json({ token: signToken(user), user });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me  (needs token)
router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

export default router;