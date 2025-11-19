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

// Share password with another user
router.post("/:id/share", async (req, res) => {
  try {
    const passwordId = req.params.id;
    const { email } = req.body;

    const recipient = await User.findOne({ email });
    if (!recipient) return res.status(404).json({ message: "User not found" });

    if (recipient._id.toString() === (req.user._id || req.user).toString())
      return res
        .status(400)
        .json({ message: "Cannot share password with yourself" });

    const password = await Password.findById(passwordId);
    if (
      !password ||
      password.ownerId.toString() !== (req.user._id || req.user).toString()
    )
      return res.status(403).json({ message: "Not allowed" });

    const existing = await SharedPassword.findOne({
      passwordId,
      sharedWithId: recipient._id,
    });
    if (existing)
      return res.status(400).json({ message: "Already shared with this user" });

    const shared = await SharedPassword.create({
      passwordId,
      sharedWithId: recipient._id,
    });
    password.shared = true;
    await password.save();

    res.json(shared);
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

export default router;
