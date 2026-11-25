import mongoose from "mongoose";

export const STUDENT_TYPES = ["School", "College", "Competitive Exam", "Other"];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["student", "seller", "admin"], default: "student" },
    college: { type: String, default: "Independent", trim: true },
    city: { type: String, default: "", trim: true },
    studentType: { type: String, enum: STUDENT_TYPES, default: "College" },
    verified: { type: Boolean, default: false }, // simulated college email verification
    status: { type: String, enum: ["active", "blocked"], default: "active" },
    ratingAvg: { type: Number, default: 0 }, // demo ratings (simulated)
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Never send the password hash to the frontend
userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model("User", userSchema);