import mongoose from "mongoose";
import Password from "././Password.js";
import bcrypt from "bcryptjs";

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

// Middleware to delete passwords when a user is removed (cascade delete)
UserSchema.pre(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    try {
      await Password.deleteMany({ user: this.id });
      next();
    } catch (err) {
      next(err);
    }
  }
);

// Hash password before saving
UserSchema.pre("save", async function (next) {
  if (!this.isModified("passwordHash")) return next();
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

// Compare password
UserSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

const User = mongoose.model("User", UserSchema);
export default User;
