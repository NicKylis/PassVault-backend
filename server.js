import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRouter from "./routes/authRouter.js";
import passwordsRouter from "./routes/passwordsRouter.js";
import { authMiddleware } from "./middleware/auth.js";
import { connectDB } from "./config/db.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.use("/", authRouter);
app.use("/api/passwords", authMiddleware, passwordsRouter);

// Export app for integration tests
export default app;

// Only start server when not running tests
if (process.env.NODE_ENV !== "test") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    connectDB();
  });
}
