import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import packsRouter from "./routes/packs";
import tripsRouter from "./routes/trips";
import usersRouter from "./routes/users";
import mediaRouter from "./routes/media";

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" })); // raised for base64 photo uploads (MVP - see MediaService note)
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/users", usersRouter);
app.use("/packs", packsRouter);
app.use("/trips", tripsRouter);
app.use("/media", mediaRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Squadlore_Travel_Proj API running on port ${PORT}`);
});
