import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import authRouter from "./routes/authRouter.js";
import passwordsRouter from "./routes/passwordsRouter.js";
import { authMiddleware } from "./middleware/auth.js";
import { connectDB } from "./config/db.js";

// New Libraries (17/11/2025)
import crypto from "crypto";
import React, { useState } from "react";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.use("/", authRouter);
app.use("/api/passwords", authMiddleware, passwordsRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  connectDB();
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