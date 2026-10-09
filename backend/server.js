require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

// ---------- Config check (fail fast with a clear message) ----------
const { MONGODB_URI, JWT_SECRET } = process.env;
const DB_NAME = process.env.DB_NAME || "test";
const PORT = process.env.PORT || 5000;

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in .env");
  process.exit(1);
}
if (!JWT_SECRET) {
  console.error("Missing JWT_SECRET in .env");
  process.exit(1);
}

const app = express();

// ---------- Middleware ----------
// FRONTEND_URL can be a comma-separated list, e.g.
// https://your-app.vercel.app,http://localhost:5500
// Trailing slashes are removed automatically (browsers never send them,
// so "https://app.vercel.app/" would otherwise be blocked by CORS).
// If not set, all origins are allowed (fine for development only).
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",")
      .map((o) => o.trim().replace(/\/+$/, ""))
      .filter(Boolean)
  : "*";

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Limit login/register attempts to slow down password guessing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});

// ---------- Model ----------
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
  },
  { timestamps: true },
);

// Third argument forces the collection name to "users"
const User = mongoose.model("User", userSchema, "users");

// ---------- Helpers ----------
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isString = (v) => typeof v === "string";

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  try {
    const token = authHeader.split(" ")[1];
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token." });
  }
}

// ---------- Routes ----------
app.get("/", (req, res) => {
  res.json({ message: "Login API is running." });
});

app.get("/api/health", (req, res) => {
  // readyState 1 = connected
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "database not connected",
  });
});

app.post("/api/register", authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!isString(name) || !isString(email) || !isString(password)) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || !cleanEmail || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ message: "Invalid email address." });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters." });
    }

    // bcrypt only uses the first 72 bytes of a password
    if (Buffer.byteLength(password, "utf8") > 72) {
      return res
        .status(400)
        .json({ message: "Password must be 72 bytes or fewer." });
    }

    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(409).json({ message: "Email is already registered." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      name: cleanName,
      email: cleanEmail,
      password: hashedPassword,
    });

    res.status(201).json({ message: "Registration successful." });
  } catch (error) {
    // Two requests with the same email at the same moment
    if (error.code === 11000) {
      return res.status(409).json({ message: "Email is already registered." });
    }
    console.error("Register error:", error);
    res.status(500).json({ message: "Server error." });
  }
});

app.post("/api/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!isString(email) || !isString(password) || !email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required." });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: "1h",
    });

    res.json({
      message: "Login successful.",
      token,
      user: {
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error." });
  }
});

app.get("/api/profile", requireAuth, async (req, res) => {
  try {
    // Read from the database so the data is always current
    const user = await User.findById(req.auth.userId).select("name email");
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json({
      message: "Protected data.",
      user: { name: user.name, email: user.email },
    });
  } catch (error) {
    console.error("Profile error:", error);
    res.status(500).json({ message: "Server error." });
  }
});

// 404 for unknown routes
app.use((req, res) => {
  res.status(404).json({ message: "Route not found." });
});

// ---------- Start ----------
mongoose
  .connect(MONGODB_URI, { dbName: DB_NAME })
  .then(() => {
    console.log(`MongoDB connected (database: ${DB_NAME}).`);
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  });
