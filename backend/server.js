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

const memberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 160, default: "" },
    phone: { type: String, trim: true, maxlength: 40, default: "" },
    plan: { type: String, trim: true, maxlength: 120, default: "" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    joined: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
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

    const joined =
      typeof body.joined === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.joined)
        ? body.joined
        : new Date().toISOString().slice(0, 10);

    const member = await Member.create({
      name,
      email,
      phone: text(body.phone, 40),
      plan: text(body.plan, 120),
      status: body.status === "inactive" ? "inactive" : "active",
      joined,
      notes: text(body.notes, 1000),
      createdBy: req.user.email,
    });

    res.status(201).json({ member });
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