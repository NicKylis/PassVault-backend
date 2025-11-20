import mongoose from "mongoose";

const sharedPasswordSchema = new mongoose.Schema(
  {
    // Contains sharedRecordId as _id
    passwordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Password",
      required: true,
    },
    sharedWithId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    favorite: { type: Boolean, default: false },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

sharedPasswordSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
  },
});

export default mongoose.model("SharedPassword", sharedPasswordSchema);
