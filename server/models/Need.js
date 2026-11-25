import mongoose from "mongoose";
import { CATEGORIES } from "./Listing.js";

const { ObjectId } = mongoose.Schema.Types;

// "Need It Board": a student posts what they are looking for, others respond if they have it
const needSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: "", trim: true, maxlength: 500 },
    category: { type: String, enum: CATEGORIES, required: true },
    maxBudget: { type: Number, min: 0, default: 0 }, // 0 = flexible
    college: { type: String, default: "Independent" },
    city: { type: String, default: "" },
    status: { type: String, enum: ["open", "fulfilled", "closed"], default: "open" },
    responses: [
      {
        user: { type: ObjectId, ref: "User", required: true },
        message: { type: String, required: true, maxlength: 300 },
        listing: { type: ObjectId, ref: "Listing", default: null }, // optional: one of the responder's listings
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Need", needSchema);