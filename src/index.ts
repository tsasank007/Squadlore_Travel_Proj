import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import packsRouter from "./routes/packs";
import tripsRouter from "./routes/trips";
import usersRouter from "./routes/users";
import mediaRouter from "./routes/media";

const app = express();
app.set("trust proxy", 1); // needed once Caddy/HTTPS sits in front, so req.protocol reports "https" correctly (used by the join-link URL)
app.use(cors());
app.use(express.json({ limit: "15mb" })); // raised for base64 photo uploads (MVP - see MediaService note)
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/config", (_req, res) => {
  // Served at runtime rather than hardcoded in public/index.html, so the
  // token never ends up committed to git (GitHub's push protection blocks
  // this even for Mapbox's "public" token type - scraped tokens can still
  // be used to run up usage against your account).
  res.json({ mapboxToken: process.env.MAPBOX_TOKEN || "" });
});

app.use("/users", usersRouter);
app.use("/packs", packsRouter);
app.use("/trips", tripsRouter);
app.use("/media", mediaRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Squadlore_Travel_Proj API running on port ${PORT}`);
});
