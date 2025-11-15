import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./config/db.js";
import Password from "./models/Password.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
const PORT = process.env.PORT || 5000;

// GET all passwords
app.get("/api/passwords", async (req, res) => {
  try {
    const listOfPasswords = await Password.find();
    res.json(listOfPasswords);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch passwords" });
  }
});

// POST create new password
app.post("/api/passwords", async (req, res) => {
  try {
    const passwordData = req.body;
    const createdPassword = await Password.create(passwordData);
    res.json(createdPassword);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create password" });
  }
});

// PUT toggle favorite
app.put("/api/passwords/:id/favorite", async (req, res) => {
  try {
    const { id } = req.params;

    const password = await Password.findById(id);

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
app.put("/api/passwords/:id/use", async (req, res) => {
  try {
    const { id } = req.params;

    const password = await Password.findByIdAndUpdate(
      id,
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

app.listen(PORT, () => {
  connectDB();
  console.log(`Server is running on port ${PORT}`);
});
