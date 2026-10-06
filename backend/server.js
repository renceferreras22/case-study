const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const crypto = require("crypto"); // Built-in Node tool for secure reset tokens
require("dotenv").config();

const app = express();

app.use(cors());
// app.use(
//   cors({
//     origin: process.env.FRONTEND_URL || "*",
//   }),
// );
app.use(express.json());

// User Schema updated with a "role" field for gym owner structure
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "customer"], default: "customer", required: true }, // Identifies gym staff vs members
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date }
});

const User = mongoose.model("User", userSchema);

// Activity Log Schema for tracking login and register in the same table
const userActivityLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  email: { type: String, required: true },
  action: { type: String, enum: ["register", "login"], required: true },
  role: { type: String, required: true }, // Logs what kind of account performed the action
  timestamp: { type: Date, default: Date.now },
  ipAddress: { type: String },
  userAgent: { type: String }
});

const UserActivityLog = mongoose.model("UserActivityLog", userActivityLogSchema);

app.get("/", (req, res) => {
  res.json({ message: "Login API is running." });
});

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body; // Accepts role from frontend signup selector

    if (!name || !email || !password || !role) {
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

    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role: role.toLowerCase() // Saves "admin" or "customer" safely
    });

    // Save registration activity record to MongoDB
    try {
      await UserActivityLog.create({
        userId: newUser._id,
        email: newUser.email,
        action: "register",
        role: newUser.role,
        ipAddress: req.ip || req.headers["x-forwarded-for"] || "Unknown",
        userAgent: req.headers["user-agent"] || "Unknown"
      });
    } catch (logError) {
      console.error("Failed to write registration audit log:", logError);
    }

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

    // Save login activity record to MongoDB
    try {
      await UserActivityLog.create({
        userId: user._id,
        email: user.email,
        action: "login",
        role: user.role,
        ipAddress: req.ip || req.headers["x-forwarded-for"] || "Unknown",
        userAgent: req.headers["user-agent"] || "Unknown"
      });
    } catch (logError) {
      console.error("Failed to write login audit log:", logError);
    }

    // Include the role inside the signed JWT token payload so frontend can read it securely
    const token = jwt.sign(
      { userId: user._id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    res.json({
      message: "Login successful.",
      token,
      user: {
        name: user.name,
        email: user.email,
        role: user.role // Sends role back to frontend dashboard routing controllers
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
});

// Forgot password route
app.post("/api/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({ message: "If that email exists, a reset link has been sent." });
    }

    const resetToken = crypto.randomBytes(20).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour expiration

    await user.save();

    // FIXED: Properly formatted query parameter link scheme for static single-page Vercel setups
    const resetUrl = `https://vercel.app{resetToken}`;

    console.log(`\n--- PASSWORD RESET MAIL ---`);
    console.log(`To: ${user.email}`);
    console.log(`Link: ${resetUrl}`);
    console.log(`---------------------------\n`);

    res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Server error." });
  }
});

// Password reset update route
app.post("/api/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { \$gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Password reset token is invalid or has expired." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    res.json({ message: "Password has been successfully updated. You can now log in." });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Server error." });
  }
});

app.get("/api/profile", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const token = authHeader.split(" ");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    res.json({
      message: "Protected data.",
      user: {
        name: decoded.name,
        email: decoded.email,
        role: decoded.role
      },
    });
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token." });
  }
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected.");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error);
  });
