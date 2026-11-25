import mongoose from "mongoose";

export const CATEGORIES = ["Textbooks", "Notes", "Calculators", "Lab Coats", "Electronics", "Stationery", "Other"];
export const CONDITIONS = ["Like New", "Good", "Fair", "Worn"];

const listingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: "", trim: true, maxlength: 1000 },
    category: { type: String, enum: CATEGORIES, required: true },
    condition: { type: String, enum: CONDITIONS, required: true },
    mode: { type: String, enum: ["sell", "exchange"], default: "sell" },
    price: { type: Number, min: 0, required: true },
    originalPrice: { type: Number, min: 0, default: 0 }, // used for "money saved" estimate
    wantInReturn: { type: String, default: "", trim: true, maxlength: 150 }, // for exchange listings
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    college: { type: String, default: "Independent" },
    city: { type: String, default: "" },
    available: { type: Boolean, default: true },
    status: { type: String, enum: ["active", "removed"], default: "active" }, // admin moderation
    reports: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reason: { type: String, maxlength: 300 },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Listing", listingSchema);