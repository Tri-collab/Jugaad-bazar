// Seeds SIMULATED demo users and listings. Safe to run again: it only resets @jugaadbazar.demo data.
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./models/User.js";
import Listing from "./models/Listing.js";
import TradeRequest from "./models/TradeRequest.js";
import Need from "./models/Need.js";
import dns from "node:dns";

dns.setServers(["8.8.8.8", "1.1.1.1"]); // same DNS fix as server.js

await mongoose.connect(process.env.MONGO_URI);

const DEMO = /@jugaadbazar\.demo$/;
const old = await User.find({ email: DEMO });
const oldIds = old.map((u) => u._id);
await TradeRequest.deleteMany({ $or: [{ buyer: { $in: oldIds } }, { seller: { $in: oldIds } }] });
await Listing.deleteMany({ seller: { $in: oldIds } });
await Need.deleteMany({ user: { $in: oldIds } });
await User.deleteMany({ email: DEMO });

const hash = (p) => bcrypt.hash(p, 10);
const TIU = { college: "Techno India University", city: "Kolkata", verified: true };

const [riya, arjun, admin, sneha] = await User.create([
  { name: "Riya Sen", email: "student@jugaadbazar.demo", passwordHash: await hash("demo123"), role: "student", studentType: "College", ratingAvg: 4.6, ratingCount: 12, ...TIU },
  { name: "Arjun Das", email: "seller@jugaadbazar.demo", passwordHash: await hash("demo123"), role: "seller", studentType: "College", ratingAvg: 4.8, ratingCount: 31, ...TIU },
  { name: "Admin", email: "admin@jugaadbazar.demo", passwordHash: await hash("admin123"), role: "admin", studentType: "College", college: "Jugaad Bazar HQ", city: "Kolkata", verified: true, ratingAvg: 5, ratingCount: 1 },
  { name: "Sneha Roy", email: "sneha@jugaadbazar.demo", passwordHash: await hash("demo123"), role: "student", studentType: "Competitive Exam", college: "Independent", city: "Delhi", verified: false, ratingAvg: 4.2, ratingCount: 6 },
]);

const mk = (u, title, category, price, originalPrice, condition, description, extra = {}) => ({
  seller: u._id, college: u.college, city: u.city, title, category, price, originalPrice, condition, description, mode: "sell", ...extra,
});

await Listing.create([
  mk(arjun, "Engineering Mathematics Vol 1", "Textbooks", 250, 650, "Good", "Clean copy, light highlighting on 3 chapters."),
  mk(arjun, "Casio fx-991ES Plus Calculator", "Calculators", 700, 1350, "Like New", "Used for one semester. Works perfectly."),
  mk(arjun, "Arduino Uno Starter Kit", "Electronics", 900, 1800, "Good", "Board, breadboard, jumper wires and sensors. All tested."),
  mk(arjun, "Data Structures in C (Book)", "Textbooks", 300, 700, "Like New", "No markings. Great for 2nd year CS."),
  mk(arjun, "Lab Coat (L)", "Lab Coats", 150, 400, "Fair", "Washed, small ink mark on pocket."),
  mk(riya, "Handwritten DBMS Notes", "Notes", 60, 150, "Fair", "Full syllabus, neat handwriting with diagrams."),
  mk(riya, "Engineering Drawing Kit", "Stationery", 200, 550, "Good", "Drafter, set squares and compass.", { mode: "exchange", wantInReturn: "Scientific calculator" }),
  mk(riya, "USB-C Laptop Cooling Pad", "Electronics", 450, 1100, "Fair", "Works fine, one fan a bit noisy."),
  mk(sneha, "Chemistry Lab Coat (M)", "Lab Coats", 180, 450, "Good", "Washed, no stains.", { mode: "exchange", wantInReturn: "Drawing board or set squares" }),
  mk(sneha, "NCERT Physics Class 12 (Part 1 & 2)", "Textbooks", 120, 290, "Good", "Both parts, solved examples marked."),
  mk(sneha, "NEET Biology Notes Bundle", "Notes", 100, 300, "Good", "Chapter-wise handwritten notes."),
  mk(sneha, "Geometry Box + Drafter", "Stationery", 90, 250, "Good", "Complete set, barely used."),
]);

const need = (u, title, category, maxBudget, description) => ({
  user: u._id, college: u.college, city: u.city, title, category, maxBudget, description,
});

await Need.create([
  need(riya, "Need Engineering Mathematics Vol 2", "Textbooks", 300, "Any recent edition is fine. Pencil marks are okay."),
  need(sneha, "Looking for NCERT Chemistry Class 12", "Textbooks", 150, "Both parts if possible."),
  need(arjun, "Need a Casio fx-82 calculator", "Calculators", 600, "Working condition, any batch."),
  need(sneha, "Wanted: Lab coat size S", "Lab Coats", 200, "Clean, no stains."),
]);

console.log("Seeded 4 demo users, 12 demo listings and 4 demo needs (all simulated).");
console.log("Student: student@jugaadbazar.demo / demo123");
console.log("Seller : seller@jugaadbazar.demo  / demo123");
console.log("Admin  : admin@jugaadbazar.demo   / admin123");
await mongoose.disconnect();