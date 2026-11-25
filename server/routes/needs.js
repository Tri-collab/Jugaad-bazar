import { Router } from "express";
import mongoose from "mongoose";
import Need from "../models/Need.js";
import Listing, { CATEGORIES } from "../models/Listing.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const USER_FIELDS = "name verified ratingAvg college city";
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function findNeed(id) {
  return mongoose.isValidObjectId(id) ? Need.findById(id) : null;
}

// GET /api/needs?q=&category=&college=&city=&status=open&page=&limit=
router.get("/", async (req, res, next) => {
  try {
    const { q, category, college, city, status = "open" } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 12, 1), 48);

    const filter = {};
    if (["open", "fulfilled", "closed"].includes(status)) filter.status = status;
    if (q?.trim()) {
      const rx = new RegExp("\\b" + escapeRx(q.trim()), "i");
      filter.$or = [{ title: rx }, { description: rx }];
    }
    if (category) filter.category = category;
    if (college) filter.college = college;
    if (city) filter.city = new RegExp("^" + escapeRx(city.trim()) + "$", "i");

    const [docs, total] = await Promise.all([
      Need.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("user", USER_FIELDS)
        .lean(),
      Need.countDocuments(filter),
    ]);

    // Public list shows only how many responses came, not the responses themselves
    const items = docs.map(({ responses, ...n }) => ({ ...n, responseCount: responses.length }));
    res.json({ items, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
  } catch (err) {
    next(err);
  }
});

// GET /api/needs/mine  (my own posts, with the responses I received)
router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const items = await Need.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("responses.user", USER_FIELDS)
      .populate("responses.listing", "title price condition available");
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// POST /api/needs  { title, description, category, maxBudget }
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { title, description, category, maxBudget } = req.body;
    if (!title?.trim()) return res.status(400).json({ message: "Tell us what you need." });
    if (!CATEGORIES.includes(category)) return res.status(400).json({ message: "Choose a valid category." });

    const budget = maxBudget === undefined || maxBudget === "" ? 0 : Number(maxBudget);
    if (!Number.isFinite(budget) || budget < 0) return res.status(400).json({ message: "Enter a valid budget." });

    const need = await Need.create({
      user: req.user._id,
      title,
      description: description || "",
      category,
      maxBudget: budget,
      college: req.user.college,
      city: req.user.city,
    });
    res.status(201).json({ need });
  } catch (err) {
    next(err);
  }
});

// POST /api/needs/:id/respond  { message, listingId? }  ("I have this")
router.post("/:id/respond", requireAuth, async (req, res, next) => {
  try {
    const need = await findNeed(req.params.id);
    if (!need || need.status !== "open") return res.status(404).json({ message: "This request is not open anymore." });
    if (need.user.equals(req.user._id)) return res.status(400).json({ message: "You cannot respond to your own request." });

    const message = (req.body.message || "").trim();
    if (message.length < 5) return res.status(400).json({ message: "Write a short message (at least 5 characters)." });
    if (need.responses.some((r) => r.user.equals(req.user._id)))
      return res.status(409).json({ message: "You already responded to this request." });

    let listingId = null;
    if (req.body.listingId) {
      if (!mongoose.isValidObjectId(req.body.listingId)) return res.status(400).json({ message: "Invalid listing." });
      const own = await Listing.findOne({ _id: req.body.listingId, seller: req.user._id, status: "active", available: true });
      if (!own) return res.status(400).json({ message: "Choose one of your own available listings." });
      listingId = own._id;
    }

    need.responses.push({ user: req.user._id, message: message.slice(0, 300), listing: listingId });
    await need.save();
    res.status(201).json({ message: "Your response was sent to the student who posted this request." });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/needs/:id/status  { status: "open" | "fulfilled" | "closed" }  (owner only)
router.patch("/:id/status", requireAuth, async (req, res, next) => {
  try {
    const need = await findNeed(req.params.id);
    if (!need) return res.status(404).json({ message: "Request not found." });
    if (!need.user.equals(req.user._id)) return res.status(403).json({ message: "Only the person who posted can change this." });

    const { status } = req.body;
    if (!["open", "fulfilled", "closed"].includes(status)) return res.status(400).json({ message: "Invalid status." });

    need.status = status;
    await need.save();
    res.json({ need });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/needs/:id  (owner or admin)
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const need = await findNeed(req.params.id);
    if (!need) return res.status(404).json({ message: "Request not found." });
    if (!need.user.equals(req.user._id) && req.user.role !== "admin")
      return res.status(403).json({ message: "You can only delete your own request." });
    await need.deleteOne();
    res.json({ message: "Request deleted." });
  } catch (err) {
    next(err);
  }
});

export default router;