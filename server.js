import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./config/db.js";
import Password from "./models/Password.js";
import User from "./models/User.js";
import jwt from "jsonwebtoken";
import { authMiddleware } from "./middleware/auth.js";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

const app = express();
app.use(express.json());
app.use(cors());
const PORT = process.env.PORT || 5000;

// GET all passwords
app.get("/api/passwords", authMiddleware, async (req, res) => {
  try {
    const listOfPasswords = await Password.find({ userId: req.user.id });
    res.json(listOfPasswords);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch passwords" });
  }
});

// POST create new password
app.post("/api/passwords", authMiddleware, async (req, res) => {
  try {
    const passwordData = req.body;
    // associate the password with the authenticated user
    const userId = req.user.id;
    passwordData.userId = userId;
    const createdPassword = await Password.create(passwordData);
    res.json(createdPassword);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create password" });
  }
});

// PUT toggle favorite
app.put("/api/passwords/:id/favorite", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // ensure the password belongs to the authenticated user
    const password = await Password.findOne({ _id: id, userId: req.user.id });

    if (!password) return res.status(404).json({ error: "Password not found" });
    password.favorite = !password.favorite;
    await password.save();

    res.json(password);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to toggle favorite" });
  }
});

// PUT mark password as used
app.put("/api/passwords/:id/use", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const password = await Password.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { lastUsedAt: new Date() },
      { new: true }
    );

    if (!password) return res.status(404).json({ error: "Password not found" });

    res.json(password);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark password as used" });
  }
});

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Please fill in all the fields." });
    }
    const existing = await User.findOne({ email });
    if (existing)
      return res.status(400).json({ error: "Email already in use" });

    const user = new User({ name, email, passwordHash: password });
    await user.save();

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user._id, name, email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to register" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to login" });
  }
});

app.listen(PORT, () => {
  connectDB();
  console.log(`Server is running on port ${PORT}`);
});
