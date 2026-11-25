import mongoose from "mongoose";

export const REQUEST_STATUSES = ["pending", "accepted", "rejected", "cancelled", "completed"];

const { ObjectId } = mongoose.Schema.Types;

const tradeRequestSchema = new mongoose.Schema(
  {
    listing: { type: ObjectId, ref: "Listing", required: true, index: true },
    buyer: { type: ObjectId, ref: "User", required: true, index: true },
    seller: { type: ObjectId, ref: "User", required: true, index: true },

    // "purchase" and "exchange" are built. "rent" and "freebie" come in the next step.
    type: { type: String, enum: ["purchase", "exchange", "rent", "freebie"], default: "purchase" },

    // Snapshot of the listing at request time (so history stays correct if the listing changes later)
    title: { type: String, required: true },
    price: { type: Number, required: true },
    originalPrice: { type: Number, default: 0 },

    // For exchange requests: what the buyer offers in return
    offerText: { type: String, default: "", maxlength: 150 },
    offeredListing: { type: ObjectId, ref: "Listing", default: null },

    message: { type: String, default: "", maxlength: 300 },
    paymentNote: { type: String, default: "Pay at meetup. No online payment (simulated)." },

    status: { type: String, enum: REQUEST_STATUSES, default: "pending" },

    // Transaction timeline: pending -> accepted -> completed (or rejected / cancelled)
    history: [
      {
        status: { type: String, enum: REQUEST_STATUSES },
        by: { type: ObjectId, ref: "User" },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("TradeRequest", tradeRequestSchema);