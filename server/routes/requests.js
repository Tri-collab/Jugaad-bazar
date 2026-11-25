
import { Router } from "express";
import mongoose from "mongoose";
import TradeRequest from "../models/TradeRequest.js";
import Listing from "../models/Listing.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const POPULATE = [
  {
    path: "listing",
    select: "title category price condition mode available status wantInReturn",
  },
  {
    path: "offeredListing",
    select: "title price condition available",
  },
  {
    path: "buyer",
    select: "name verified ratingAvg college city",
  },
  {
    path: "seller",
    select: "name verified ratingAvg college city",
  },
];

// Update request status and history
const setStatus = (r, status, userId) => {
  r.status = status;
  r.history.push({
    status,
    by: userId,
  });
};

// Load request by ID
async function loadRequest(id) {
  return mongoose.isValidObjectId(id)
    ? TradeRequest.findById(id)
    : null;
}

// Release listing and offered listing
const releaseItems = async (r) => {
  const ids = [r.listing, r.offeredListing].filter(Boolean);

  return Listing.updateMany(
    {
      _id: { $in: ids },
      status: "active",
      available: false,
    },
    {
      $set: { available: true },
    }
  );
};

// POST /api/requests
// Purchase: { listingId, message }
// Exchange: { listingId, type: "exchange", offeredListingId?, offerText?, message }

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const {
      listingId,
      message,
      offerText,
      offeredListingId,
    } = req.body;

    const type =
      req.body.type === "exchange" ? "exchange" : "purchase";

    if (!mongoose.isValidObjectId(listingId)) {
      return res.status(400).json({
        message: "Invalid listing.",
      });
    }

    const listing = await Listing.findById(listingId);

    if (!listing || listing.status !== "active") {
      return res.status(404).json({
        message: "Listing not found.",
      });
    }

    if (listing.seller.equals(req.user._id)) {
      return res.status(400).json({
        message: "You cannot request your own listing.",
      });
    }

    if (!listing.available) {
      return res.status(409).json({
        message: "This item is already reserved or sold.",
      });
    }

    if (type === "purchase" && listing.mode !== "sell") {
      return res.status(400).json({
        message: "This is an exchange listing. Please send an exchange request instead.",
      });
    }

    if (type === "exchange" && listing.mode !== "exchange") {
      return res.status(400).json({
        message: "This item is for sale. Please send a purchase request instead.",
      });
    }

    // Exchange details
    let offered = null;
    let offerLabel = "";

    if (type === "exchange") {
      if (offeredListingId) {
        if (!mongoose.isValidObjectId(offeredListingId)) {
          return res.status(400).json({
            message: "Invalid offered listing.",
          });
        }

        offered = await Listing.findOne({
          _id: offeredListingId,
          seller: req.user._id,
          status: "active",
          available: true,
        });

        if (!offered) {
          return res.status(400).json({
            message: "Choose one of your own available listings to offer.",
          });
        }

        if (offered._id.equals(listing._id)) {
          return res.status(400).json({
            message: "You cannot offer the same listing.",
          });
        }

        offerLabel = offered.title;
      } else {
        offerLabel = String(offerText || "").trim().slice(0, 150);

        if (offerLabel.length < 3) {
          return res.status(400).json({
            message: "Tell us what you want to offer in exchange.",
          });
        }
      }
    }

    // Prevent duplicate active requests
    const duplicate = await TradeRequest.findOne({
      listing: listing._id,
      buyer: req.user._id,
      status: {
        $in: ["pending", "accepted"],
      },
    });

    if (duplicate) {
      return res.status(409).json({
        message: "You already have an active request for this item.",
      });
    }

    const request = await TradeRequest.create({
      listing: listing._id,
      buyer: req.user._id,
      seller: listing.seller,
      type,
      title: listing.title,
      price: listing.price,
      originalPrice: listing.originalPrice,
      offerText: offerLabel,
      offeredListing: offered ? offered._id : null,
      message: String(message || "").trim().slice(0, 300),
      history: [
        {
          status: "pending",
          by: req.user._id,
        },
      ],
    });

    await request.populate(POPULATE);

    return res.status(201).json({ request });
  } catch (err) {
    next(err);
  }
});

// GET /api/requests/sent
// Requests sent by the buyer

router.get("/sent", requireAuth, async (req, res, next) => {
  try {
    const items = await TradeRequest.find({
      buyer: req.user._id,
    })
      .sort({ createdAt: -1 })
      .populate(POPULATE);

    return res.json({ items });
  } catch (err) {
    next(err);
  }
});

// GET /api/requests/received
// Requests received by the seller

router.get("/received", requireAuth, async (req, res, next) => {
  try {
    const items = await TradeRequest.find({
      seller: req.user._id,
    })
      .sort({ createdAt: -1 })
      .populate(POPULATE);

    return res.json({ items });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/requests/:id/respond
// Seller accepts or rejects a request

router.patch("/:id/respond", requireAuth, async (req, res, next) => {
  try {
    const r = await loadRequest(req.params.id);

    if (!r) {
      return res.status(404).json({
        message: "Request not found.",
      });
    }

    if (!r.seller.equals(req.user._id)) {
      return res.status(403).json({
        message: "Only the seller can respond to this request.",
      });
    }

    if (r.status !== "pending") {
      return res.status(409).json({
        message: `This request is already ${r.status}.`,
      });
    }

    const { action } = req.body;

    if (action !== "accept" && action !== "reject") {
      return res.status(400).json({
        message: 'Action must be "accept" or "reject".',
      });
    }

    // Reject request
    if (action === "reject") {
      const rejected = await TradeRequest.findOneAndUpdate(
        {
          _id: r._id,
          status: "pending",
        },
        {
          $set: { status: "rejected" },
          $push: {
            history: {
              status: "rejected",
              by: req.user._id,
            },
          },
        },
        {
          new: true,
          runValidators: true,
        }
      );

      if (!rejected) {
        return res.status(409).json({
          message: "This request has already been processed.",
        });
      }

      await rejected.populate(POPULATE);

      return res.json({ request: rejected });
    }

    // Accept request: reserve main listing
    const reserved = await Listing.findOneAndUpdate(
      {
        _id: r.listing,
        available: true,
        status: "active",
      },
      {
        $set: { available: false },
      },
      { new: true }
    );

    if (!reserved) {
      return res.status(409).json({
        message: "This item is no longer available.",
      });
    }

    // Reserve offered listing for exchange
    if (r.offeredListing) {
      const offered = await Listing.findOneAndUpdate(
        {
          _id: r.offeredListing,
          available: true,
          status: "active",
          seller: r.buyer,
        },
        {
          $set: { available: false },
        },
        { new: true }
      );

      if (!offered) {
        await Listing.findOneAndUpdate(
          {
            _id: r.listing,
            available: false,
            status: "active",
          },
          {
            $set: { available: true },
          }
        );

        return res.status(409).json({
          message: "The offered item is no longer available.",
        });
      }
    }

    // Accept only if request is still pending
    const accepted = await TradeRequest.findOneAndUpdate(
      {
        _id: r._id,
        status: "pending",
      },
      {
        $set: { status: "accepted" },
        $push: {
          history: {
            status: "accepted",
            by: req.user._id,
          },
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!accepted) {
      await releaseItems(r);

      return res.status(409).json({
        message: "This request has already been processed.",
      });
    }

    // Reject all other pending requests for the same listing
    await TradeRequest.updateMany(
      {
        listing: r.listing,
        _id: { $ne: r._id },
        status: "pending",
      },
      {
        $set: { status: "rejected" },
        $push: {
          history: {
            status: "rejected",
            by: req.user._id,
          },
        },
      }
    );

    await accepted.populate(POPULATE);

    return res.json({ request: accepted });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/requests/:id/cancel
// Buyer can cancel pending or accepted
// Seller can cancel accepted

router.patch("/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    const r = await loadRequest(req.params.id);

    if (!r) {
      return res.status(404).json({
        message: "Request not found.",
      });
    }

    const isBuyer = r.buyer.equals(req.user._id);
    const isSeller = r.seller.equals(req.user._id);

    if (!isBuyer && !isSeller) {
      return res.status(403).json({
        message: "This request is not yours.",
      });
    }

    const allowed = isBuyer
      ? ["pending", "accepted"]
      : ["accepted"];

    if (!allowed.includes(r.status)) {
      return res.status(409).json({
        message: `You cannot cancel a ${r.status} request.`,
      });
    }

    // Update request status atomically
    const cancelled = await TradeRequest.findOneAndUpdate(
      {
        _id: r._id,
        status: { $in: allowed },
      },
      {
        $set: { status: "cancelled" },
        $push: {
          history: {
            status: "cancelled",
            by: req.user._id,
          },
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!cancelled) {
      return res.status(409).json({
        message: "This request has already been processed.",
      });
    }

    // Release reserved items
    if (r.status === "accepted") {
      await releaseItems(r);
    }

    await cancelled.populate(POPULATE);

    return res.json({ request: cancelled });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/requests/:id/complete
// Seller marks deal as completed

router.patch("/:id/complete", requireAuth, async (req, res, next) => {
  try {
    const r = await loadRequest(req.params.id);

    if (!r) {
      return res.status(404).json({
        message: "Request not found.",
      });
    }

    if (!r.seller.equals(req.user._id)) {
      return res.status(403).json({
        message: "Only the seller can complete the deal.",
      });
    }

    if (r.status !== "accepted") {
      return res.status(409).json({
        message: "Only an accepted request can be completed.",
      });
    }

    const completed = await TradeRequest.findOneAndUpdate(
      {
        _id: r._id,
        status: "accepted",
      },
      {
        $set: { status: "completed" },
        $push: {
          history: {
            status: "completed",
            by: req.user._id,
          },
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!completed) {
      return res.status(409).json({
        message: "This request has already been processed.",
      });
    }

    await completed.populate(POPULATE);

    return res.json({ request: completed });
  } catch (err) {
    next(err);
  }
});

export default router;
