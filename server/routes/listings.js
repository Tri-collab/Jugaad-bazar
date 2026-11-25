import { Router } from "express";
import mongoose from "mongoose";
import Listing, { CATEGORIES, CONDITIONS } from "../models/Listing.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

const SELLER_FIELDS = "name verified ratingAvg ratingCount college city";
const FIELDS = ["title", "description", "category", "condition", "mode", "price", "originalPrice", "wantInReturn"];

const pick = (src) => Object.fromEntries(FIELDS.filter((k) => src[k] !== undefined).map((k) => [k, src[k]]));
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const canEdit = (listing, user) => listing.seller.equals(user._id) || user.role === "admin";

async function findListing(id) {
  return mongoose.isValidObjectId(id) ? Listing.findById(id) : null;
}

function validate(d) {
  if (!d.title?.trim()) return "Title is required.";
  if (!CATEGORIES.includes(d.category)) return "Choose a valid category.";
  if (!CONDITIONS.includes(d.condition)) return "Choose a valid condition.";
  if (!["sell", "exchange"].includes(d.mode || "sell")) return "Invalid listing type.";
  const price = Number(d.price);
  if (!Number.isFinite(price) || price < 0) return "Enter a valid price.";
  const orig = d.originalPrice;
  if (orig !== undefined && orig !== "" && orig !== null && (!Number.isFinite(Number(orig)) || Number(orig) < 0))
    return "Enter a valid original price.";
  if (d.mode === "exchange" && !d.wantInReturn?.trim()) return "Tell us what you want in exchange.";
  return null;
}

// GET /api/listings?q=&category=&condition=&mode=&college=&city=&minPrice=&maxPrice=&available=true&sort=&page=&limit=
router.get("/", async (req, res, next) => {
  try {
    const { q, category, condition, mode, college, city, minPrice, maxPrice, available, sort = "newest" } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 12, 1), 48);

    const filter = { status: "active" };
    if (q?.trim()) {
      const rx = new RegExp("\\b" + escapeRx(q.trim()), "i");
      filter.$or = [{ title: rx }, { description: rx }];
    }
    if (category) filter.category = category;
    if (condition) filter.condition = condition;
    if (mode) filter.mode = mode;
    if (college) filter.college = college;
    if (city) filter.city = new RegExp("^" + escapeRx(city.trim()) + "$", "i");
    if (available === "true") filter.available = true;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (Number.isFinite(Number(minPrice)) && minPrice !== "") filter.price.$gte = Number(minPrice);
      if (Number.isFinite(Number(maxPrice)) && maxPrice !== "") filter.price.$lte = Number(maxPrice);
    }

    const sortMap = { newest: { createdAt: -1 }, price_asc: { price: 1 }, price_desc: { price: -1 } };
    const [items, total] = await Promise.all([
      Listing.find(filter)
        .select("-reports")
        .sort(sortMap[sort] || sortMap.newest)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("seller", SELLER_FIELDS),
      Listing.countDocuments(filter),
    ]);

    res.json({ items, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
  } catch (err) {
    next(err);
  }
});

// GET /api/listings/mine  (logged-in user's own listings, all statuses)
router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const items = await Listing.find({ seller: req.user._id }).select("-reports").sort({ createdAt: -1 });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// GET /api/listings/:id
router.get("/:id", async (req, res, next) => {
  try {
    const l = await findListing(req.params.id);
    if (!l || l.status === "removed") return res.status(404).json({ message: "Listing not found." });
    await l.populate("seller", SELLER_FIELDS);
    const obj = l.toObject();
    delete obj.reports;
    res.json({ listing: obj });
  } catch (err) {
    next(err);
  }
});

// POST /api/listings
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const data = pick(req.body);
    const error = validate(data);
    if (error) return res.status(400).json({ message: error });

    const listing = await Listing.create({
      ...data,
      price: Number(data.price),
      originalPrice: Number(data.originalPrice) || Number(data.price),
      seller: req.user._id,
      college: req.user.college,
      city: req.user.city,
    });
    res.status(201).json({ listing });
  } catch (err) {
    next(err);
  }
});

// PUT /api/listings/:id  (owner or admin)
router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const l = await findListing(req.params.id);
    if (!l) return res.status(404).json({ message: "Listing not found." });
    if (!canEdit(l, req.user)) return res.status(403).json({ message: "You can only edit your own listings." });

    const merged = { ...l.toObject(), ...pick(req.body) };
    const error = validate(merged);
    if (error) return res.status(400).json({ message: error });

    Object.assign(l, pick(req.body));
    if (req.body.price !== undefined) l.price = Number(req.body.price);
    if (req.body.originalPrice !== undefined) l.originalPrice = Number(req.body.originalPrice) || l.price;
    await l.save();
    res.json({ listing: l });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/listings/:id  (owner or admin)
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const l = await findListing(req.params.id);
    if (!l) return res.status(404).json({ message: "Listing not found." });
    if (!canEdit(l, req.user)) return res.status(403).json({ message: "You can only delete your own listings." });
    await l.deleteOne();
    res.json({ message: "Listing deleted." });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/listings/:id/availability  (owner toggles available / sold)
router.patch("/:id/availability", requireAuth, async (req, res, next) => {
  try {
    const l = await findListing(req.params.id);
    if (!l) return res.status(404).json({ message: "Listing not found." });
    if (!canEdit(l, req.user)) return res.status(403).json({ message: "Only the seller can change availability." });
    l.available = typeof req.body.available === "boolean" ? req.body.available : !l.available;
    await l.save();
    res.json({ listing: l });
  } catch (err) {
    next(err);
  }
});

// POST /api/listings/:id/report
router.post("/:id/report", requireAuth, async (req, res, next) => {
  try {
    const l = await findListing(req.params.id);
    if (!l) return res.status(404).json({ message: "Listing not found." });
    if (l.seller.equals(req.user._id)) return res.status(400).json({ message: "You cannot report your own listing." });

    const reason = (req.body.reason || "").trim();
    if (reason.length < 5) return res.status(400).json({ message: "Please describe the problem (at least 5 characters)." });
    if (l.reports.some((r) => r.user.equals(req.user._id)))
      return res.status(409).json({ message: "You already reported this listing." });

    l.reports.push({ user: req.user._id, reason: reason.slice(0, 300) });
    await l.save();
    res.json({ message: "Report submitted. Admin will review it." });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/listings/:id/moderate  (admin only: { status: "active" | "removed" })
router.patch("/:id/moderate", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!["active", "removed"].includes(status)) return res.status(400).json({ message: "Invalid status." });
    const l = await findListing(req.params.id);
    if (!l) return res.status(404).json({ message: "Listing not found." });
    l.status = status;
    await l.save();
    res.json({ listing: l });
  } catch (err) {
    next(err);
  }
});

export default router;