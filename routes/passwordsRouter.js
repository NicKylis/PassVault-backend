import express from "express";
import Password from "../models/Password.js";
import SharedPassword from "../models/SharedPassword.js";
import User from "../models/User.js";

const router = express.Router();

// Create password (owner)
router.post("/", async (req, res) => {
  try {
    const newPass = await Password.create({
      ...req.body,
      ownerId: req.user._id || req.user,
      lastUsedAt: new Date(),
    });
    res.json(newPass);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all passwords for user
router.get("/", async (req, res) => {
  try {
    const owned = await Password.find({ ownerId: req.user._id || req.user });
    const shared = await SharedPassword.find({
      sharedWithId: req.user,
    }).populate("passwordId");

    res.json({
      owned,
      shared: shared.map((item) => ({
        ...item.passwordId.toObject(), // actual password fields
        favorite: item.favorite, // user-specific favorite
        lastUsedAt: item.lastUsedAt, // user-specific last used
        shared: true,
        sharedRecordId: item._id, // <--- important!
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle favorite (owner or shared)
router.patch("/:id/favorite", async (req, res) => {
  try {
    const userId = req.user._id || req.user;
    const passwordId = req.params.id;
    const { shared } = req.body || {};

    if (shared) {
      // Shared case
      const sharedRecord = await SharedPassword.findOne({
        _id: passwordId,
        sharedWithId: userId,
      });
      if (!sharedRecord)
        return res.status(403).json({ message: "Access denied" });

      sharedRecord.favorite = !sharedRecord.favorite;
      await sharedRecord.save();

      return res.json({
        favorite: sharedRecord.favorite,
        message: "Shared favorite toggled",
      });
    }

    // Owner case
    const password = await Password.findOne({
      _id: passwordId,
      ownerId: userId,
    });
    if (!password) return res.status(403).json({ message: "Not allowed" });

    password.favorite = !password.favorite;
    await password.save();

    res.json({
      favorite: password.favorite,
      message: "Owner favorite toggled",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// Mark password as used
router.patch("/:id/use", async (req, res) => {
  try {
    const userId = req.user._id || req.user;
    const passwordId = req.params.id;
    const { shared } = req.body || {};

    if (shared) {
      // Shared case
      const sharedRecord = await SharedPassword.findOne({
        _id: passwordId,
        sharedWithId: userId,
      });
      if (!sharedRecord)
        return res.status(403).json({ message: "Access denied" });

      sharedRecord.lastUsedAt = new Date();
      await sharedRecord.save();

      return res.json({
        lastUsedAt: sharedRecord.lastUsedAt,
        message: "Shared password used",
      });
    }

    const password = await Password.findOne({
      _id: passwordId,
      ownerId: userId,
    });
    if (!password) return res.status(403).json({ message: "Not allowed" });

    password.lastUsedAt = new Date();
    await password.save();

    res.json({
      lastUsedAt: password.lastUsedAt,
      message: "Owner password used",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// Remove shared password from profile
router.delete("/shared/:id", async (req, res) => {
  await SharedPassword.deleteOne({
    _id: req.params.id,
    sharedWithId: req.user._id || req.user,
  });
  res.json({ message: "Removed" });
});

// Share password with other users (owner only)
router.post("/:id/share", async (req, res) => {
  try {
    const passwordId = req.params.id;
    const { emails } = req.body; // Expect: array of emails

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ message: "No emails provided" });
    }

    // Verify requester is owner
    const password = await Password.findById(passwordId);
    const userId = req.user._id?.toString() || req.user.toString();
    if (!password) {
      return res.status(404).json({ message: "Password not found" });
    }

    if (password.ownerId.toString() !== userId) {
      return res.status(403).json({ message: "Not owner" });
    }

    const results = [];

    for (const email of emails) {
      const recipient = await User.findOne({ email: email.trim() });
      if (!recipient) {
        results.push({ email, status: "failed", reason: "User not found" });
        continue;
      }

      // Owner cannot share to themselves
      if (recipient._id.toString() === userId) {
        results.push({
          email,
          status: "failed",
          reason: "Cannot share with yourself",
        });
        continue;
      }

      // Check if already shared
      const existing = await SharedPassword.findOne({
        passwordId,
        sharedWithId: recipient._id,
      });
      if (existing) {
        results.push({ email, status: "failed", reason: "Already shared" });
        continue;
      }

      // Create shared record
      const shared = await SharedPassword.create({
        passwordId,
        sharedWithId: recipient._id,
        favorite: false,
      });

      results.push({ email, status: "success", sharedId: shared._id });
    }

    res.json({ message: "Share operation completed", results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// Update password (owner only)
router.put("/:id", async (req, res) => {
  try {
    const pass = await Password.findOne({
      _id: req.params.id,
      ownerId: req.user._id || req.user,
    });
    if (!pass) return res.status(403).json({ message: "Not allowed" });

    Object.assign(pass, req.body);
    await pass.save();
    res.json(pass);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete password (owner only)
router.delete("/:id", async (req, res) => {
  try {
    const pass = await Password.findOneAndDelete({
      _id: req.params.id,
      ownerId: req.user._id || req.user,
    });
    if (!pass) return res.status(403).json({ message: "Not allowed" });

    await SharedPassword.deleteMany({ passwordId: pass._id });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all users this password is shared with
router.get("/:id/shared-users", async (req, res) => {
  try {
    const passwordId = req.params.id;

    // Ensure owner
    const password = await Password.findOne({
      _id: passwordId,
      ownerId: req.user.id,
    });

    if (!password) {
      return res.status(403).json({ message: "Not allowed" });
    }
    // Find all records in SharedPassword
    const sharedEntries = await SharedPassword.find({ passwordId }).populate(
      "sharedWithId",
      "name email"
    );

    res.json(sharedEntries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
