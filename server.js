import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./config/db.js";
import Password from "./models/Password.js";

// New Libraries (17/11/2025)
import crypto from "crypto";
import React, { useState } from "react";

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

/** New Code By Mpinos
 *  Includes SHA-512 Encryption & Password Strength Function
 *  Added: 17/11/2025
 */

export function sha512(input) {
  return crypto.createHash("sha512").update(input, "utf8").digest("hex");
}

export default function PasswordStrengthChecker() {
  const [password, setPassword] = useState("");
  const [strength, setStrength] = useState("");

  const evaluateStrength = (value) => {
    if (!value) return "";

    let score = 0;

    // Basic scoring logic
    if (value.length >= 8) score++;
    if (/[A-Z]/.test(value)) score++;
    if (/[0-9]/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++; // special characters

    if (score <= 1) return "Weak";
    if (score === 2 || score === 3) return "Average";
    return "Good";
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setPassword(val);
    setStrength(evaluateStrength(val));
  };

  return (
    <div style={{ maxWidth: "300px", fontFamily: "Arial" }}>
      <label>Password:</label>
      <input
        type="text"
        value={password}
        onChange={handleChange}
        style={{
          width: "100%",
          padding: "8px",
          marginTop: "5px",
          marginBottom: "10px",
        }}
      />
      {strength && (
        <div>
          Strength:{" "}
          <strong
            style={{
              color:
                strength === "Good"
                  ? "green"
                  : strength === "Average"
                  ? "orange"
                  : "red",
            }}
          >
            {strength}
          </strong>
        </div>
      )}
    </div>
  );
}