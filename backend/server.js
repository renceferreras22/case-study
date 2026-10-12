const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const crypto = require("crypto");
require("dotenv").config();

const app = express();

app.use(cors());
// app.use(
//   cors({
//     origin: process.env.FRONTEND_URL || "*",
//   }),
// );
app.use(express.json());

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
});

const User = mongoose.model("User", userSchema);

app.get("/", (req, res) => {
  res.json({ message: "Login API is running." });
});

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "Email is already registered." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email,
      password: hashedPassword,
    });

    res.status(201).json({ message: "Registration successful." });
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = jwt.sign(
      { userId: user._id, name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    res.json({
      message: "Login successful.",
      token,
      user: {
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
});

app.get("/api/profile", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    res.json({
      message: "Protected data.",
      user: {
        name: decoded.name,
        email: decoded.email,
      },
    });
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token." });
  }
});

/* =====================================================================
   Members and payments  ->  MongoDB "test" database
     Member  model -> "members"  collection
     Payment model -> "payments" collection
   Every route below requires the login token (Authorization: Bearer ...).
   ===================================================================== */

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  try {
    req.user = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token." });
  }
};

const toJSONOptions = {
  transform: (doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
};

const text = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const round2 = (n) => Math.round(n * 100) / 100;

// A real calendar date written as YYYY-MM-DD (rejects things like 2026-02-31).
const isDateStr = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

// "Today" as YYYY-MM-DD in the gym's timezone (default Manila; override with GYM_TIMEZONE on Render).
const todayInGym = () => {
  try {
    return new Date().toLocaleDateString("en-CA", { timeZone: process.env.GYM_TIMEZONE || "Asia/Manila" });
  } catch (error) {
    return new Date().toISOString().slice(0, 10);
  }
};

// A membership is expired once its expiry date has passed (the expiry day itself still counts).
const isExpired = (member) => Boolean(member.expiresAt) && member.expiresAt < todayInGym();

const memberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 160, default: "" },
    phone: { type: String, trim: true, maxlength: 40, default: "" },
    plan: { type: String, trim: true, maxlength: 120, default: "" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    joined: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    expiresAt: { type: String, match: /^\d{4}-\d{2}-\d{2}$/, default: "" },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true, collection: "members", toJSON: toJSONOptions },
);

const Member = mongoose.model("Member", memberSchema);

const paymentSchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: "Member" },
    memberName: { type: String, required: true, trim: true, maxlength: 120 },
    purpose: { type: String, required: true, trim: true, maxlength: 120 },
    method: { type: String, enum: ["cash", "gcash"], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    cashReceived: { type: Number },
    change: { type: Number },
    paidAt: { type: Date, required: true },
    reference: { type: String, required: true },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    status: { type: String, enum: ["pending", "paid", "cancelled"], default: "paid" },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true, collection: "payments", toJSON: toJSONOptions },
);

const Payment = mongoose.model("Payment", paymentSchema);

// One document per visit. checkOutAt stays null while the member is still in the gym.
const checkinSchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: "Member" },
    memberName: { type: String, required: true, trim: true, maxlength: 120 },
    checkInAt: { type: Date, required: true },
    checkOutAt: { type: Date, default: null },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true, collection: "checkins", toJSON: toJSONOptions },
);

const Checkin = mongoose.model("Checkin", checkinSchema);

/* ---------- members ---------- */

app.get("/api/members", requireAuth, async (req, res) => {
  try {
    const members = await Member.find().sort({ createdAt: -1 }).limit(2000);
    res.json({ members });
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
});

app.post("/api/members", requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const name = text(body.name, 120);
    const email = text(body.email, 160).toLowerCase();

    if (!name) {
      return res.status(400).json({ message: "Full name is required." });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }

    if (email && (await Member.findOne({ email }))) {
      return res
        .status(409)
        .json({ message: "A member with this email address already exists." });
    }

    const joined = isDateStr(body.joined) ? body.joined : todayInGym();
    const expiresAt = body.expiresAt === undefined || body.expiresAt === "" ? "" : body.expiresAt;

    if (expiresAt && !isDateStr(expiresAt)) {
      return res.status(400).json({ message: "Enter a valid expiry date." });
    }
    if (expiresAt && expiresAt < joined) {
      return res.status(400).json({ message: "The expiry date can't be before the join date." });
    }

    const member = await Member.create({
      name,
      email,
      phone: text(body.phone, 40),
      plan: text(body.plan, 120),
      status: body.status === "inactive" ? "inactive" : "active",
      joined,
      expiresAt,
      notes: text(body.notes, 1000),
      createdBy: req.user.email,
    });

    // Optionally record a check-in at the same time (active, non-expired members only).
    let checkin = null;
    if (body.checkIn === true && member.status === "active" && !isExpired(member)) {
      checkin = await Checkin.create({
        member: member._id,
        memberName: member.name,
        checkInAt: new Date(),
        createdBy: req.user.email,
      });
    }

    res.status(201).json({ member, checkin });
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
});

// Edit a member's details (name, email, phone, plan, join date, expiry date, notes).
// Only the fields that are sent are changed. Status has its own route, below.
app.patch("/api/members/:id", requireAuth, async (req, res) => {
  try {
    const body = req.body || {};

    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      return res.status(400).json({ message: "Invalid member id." });
    }

    const member = await Member.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ message: "Member not found." });
    }

    if (body.name !== undefined) {
      const name = text(body.name, 120);
      if (!name) {
        return res.status(400).json({ message: "Full name is required." });
      }
      member.name = name;
    }

    if (body.email !== undefined) {
      const email = text(body.email, 160).toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Enter a valid email address." });
      }
      if (email) {
        const other = await Member.findOne({ email });
        if (other && String(other._id) !== String(member._id)) {
          return res
            .status(409)
            .json({ message: "A member with this email address already exists." });
        }
      }
      member.email = email;
    }

    if (body.phone !== undefined) member.phone = text(body.phone, 40);
    if (body.plan !== undefined) member.plan = text(body.plan, 120);
    if (body.notes !== undefined) member.notes = text(body.notes, 1000);

    if (body.joined !== undefined) {
      if (!isDateStr(body.joined)) {
        return res.status(400).json({ message: "Enter a valid join date." });
      }
      member.joined = body.joined;
    }

    if (body.expiresAt !== undefined) {
      if (body.expiresAt !== "" && !isDateStr(body.expiresAt)) {
        return res.status(400).json({ message: "Enter a valid expiry date." });
      }
      member.expiresAt = body.expiresAt;
    }

    if (member.expiresAt && member.joined && member.expiresAt < member.joined) {
      return res.status(400).json({ message: "The expiry date can't be before the join date." });
    }

    const renamed = body.name !== undefined;
    await member.save();

    // Keep the "Members in gym" list in step with a rename (finished visits keep the old name).
    if (renamed) {
      await Checkin.updateMany(
        { member: member._id, checkOutAt: null },
        { memberName: member.name },
      );
    }

    res.json({ member });
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
});

// Switch a member between active and inactive.
app.patch("/api/members/:id/status", requireAuth, async (req, res) => {
  try {
    const status = (req.body || {}).status;

    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      return res.status(400).json({ message: "Invalid member id." });
    }
    if (status !== "active" && status !== "inactive") {
      return res.status(400).json({ message: "Status must be active or inactive." });
    }

    const member = await Member.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ message: "Member not found." });
    }

    member.status = status;
    await member.save();

    res.json({ member });
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
});

app.delete("/api/members/:id", requireAuth, async (req, res) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      return res.status(400).json({ message: "Invalid member id." });
    }

    const deleted = await Member.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Member not found." });
    }

    await Checkin.updateMany(
      { member: req.params.id, checkOutAt: null },
      { checkOutAt: new Date() },
    );

    res.json({ message: "Member deleted." });
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
});

/* ---------- payments ---------- */

const makeReference = (method) => {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const code = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${method === "cash" ? "CSH" : "GCS"}-${day}-${code}`;
};

app.get("/api/payments", requireAuth, async (req, res) => {
  try {
    const payments = await Payment.find()
      .sort({ paidAt: -1, createdAt: -1 })
      .limit(5000);
    res.json({ payments });
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
});

app.post("/api/payments", requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const method = body.method === "cash" || body.method === "gcash" ? body.method : null;
    const purpose = text(body.purpose, 120);
    const amount = round2(Number(body.amount));
    const paidAt = new Date(typeof body.paidAt === "string" ? body.paidAt : NaN);

    if (!method) {
      return res.status(400).json({ message: "Payment method must be cash or gcash." });
    }
    if (typeof body.memberId !== "string" || !mongoose.isObjectIdOrHexString(body.memberId)) {
      return res.status(400).json({ message: "Select a member." });
    }
    if (!purpose) {
      return res.status(400).json({ message: "Payment purpose is required." });
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
      return res.status(400).json({ message: "Enter a valid payment amount." });
    }
    if (isNaN(paidAt.getTime())) {
      return res.status(400).json({ message: "Payment date is invalid." });
    }

    const member = await Member.findById(body.memberId);
    if (!member) {
      return res.status(404).json({ message: "Member not found." });
    }

    const doc = {
      member: member._id,
      memberName: member.name,
      purpose,
      method,
      amount,
      paidAt,
      reference: makeReference(method),
      notes: text(body.notes, 1000),
      createdBy: req.user.email,
    };

    if (method === "cash") {
      const cashReceived = round2(Number(body.cashReceived));
      if (!Number.isFinite(cashReceived) || cashReceived < amount) {
        return res
          .status(400)
          .json({ message: "Cash received is less than the amount due." });
      }
      doc.cashReceived = cashReceived;
      doc.change = round2(cashReceived - amount);
      doc.status = "paid";
    } else {
      doc.status = "pending";
    }

    const payment = await Payment.create(doc);
    res.status(201).json({ payment });
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
});

// A GCash payment starts as "pending"; staff then mark it paid or cancelled.
app.patch("/api/payments/:id/status", requireAuth, async (req, res) => {
  try {
    const status = (req.body || {}).status;

    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      return res.status(400).json({ message: "Invalid payment id." });
    }
    if (status !== "paid" && status !== "cancelled") {
      return res.status(400).json({ message: "Status must be paid or cancelled." });
    }

    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found." });
    }
    if (payment.status !== "pending") {
      return res
        .status(409)
        .json({ message: "Only pending payments can be updated." });
    }

    payment.status = status;
    await payment.save();

    res.json({ payment });
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
});

/* ---------- check-ins ---------- */

app.get("/api/checkins", requireAuth, async (req, res) => {
  try {
    const checkins = await Checkin.find().sort({ checkInAt: -1 }).limit(1000);
    res.json({ checkins });
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
});

app.post("/api/checkins", requireAuth, async (req, res) => {
  try {
    const memberId = (req.body || {}).memberId;

    if (typeof memberId !== "string" || !mongoose.isObjectIdOrHexString(memberId)) {
      return res.status(400).json({ message: "Select a member." });
    }

    const member = await Member.findById(memberId);
    if (!member) {
      return res.status(404).json({ message: "Member not found." });
    }
    if (member.status !== "active") {
      return res.status(400).json({ message: "Inactive members can't check in." });
    }
    if (isExpired(member)) {
      return res.status(400).json({
        message: `${member.name}'s membership expired on ${member.expiresAt}. Renew it before checking in.`,
      });
    }
    if (await Checkin.findOne({ member: member._id, checkOutAt: null })) {
      return res.status(409).json({ message: `${member.name} is already in the gym.` });
    }

    const checkin = await Checkin.create({
      member: member._id,
      memberName: member.name,
      checkInAt: new Date(),
      createdBy: req.user.email,
    });

    res.status(201).json({ checkin });
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
});

app.patch("/api/checkins/:id/checkout", requireAuth, async (req, res) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      return res.status(400).json({ message: "Invalid check-in id." });
    }

    const checkin = await Checkin.findById(req.params.id);
    if (!checkin) {
      return res.status(404).json({ message: "Check-in not found." });
    }
    if (checkin.checkOutAt) {
      return res.status(409).json({ message: "This member is already checked out." });
    }

    checkin.checkOutAt = new Date();
    await checkin.save();

    res.json({ checkin });
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
});

// Return JSON (not an HTML page) for malformed requests.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  res
    .status(error.status === 400 ? 400 : 500)
    .json({ message: error.status === 400 ? "Invalid request." : "Server error." });
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected.");
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error);
  });
