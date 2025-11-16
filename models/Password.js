import mongoose from "mongoose";

const PasswordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    website: {
      type: String,
      default: null,
    },
    favorite: {
      type: Boolean,
      default: false,
    },
    category: {
      type: String,
      enum: ["Social Media", "Email", "ECommerce", "Banking", "Other"],
      default: "Other",
    },
    passwordStrength: {
      type: String,
      enum: ["Weak", "Good", "Strong"],
      default: "Good",
    },
    notes: {
      type: String,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Password = mongoose.model("Password", PasswordSchema);

export default Password;
