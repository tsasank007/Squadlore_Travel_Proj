import { Router } from "express";
import multer from "multer";
import { TripService } from "../services/TripService";
import { LocationService } from "../services/LocationService";
import { MediaService } from "../services/MediaService";
import { MemoryStreamService } from "../services/MemoryStreamService";

const router = Router();
const tripService = new TripService();
const locationService = new LocationService();
const mediaService = new MediaService();
const memoryStreamService = new MemoryStreamService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

router.post("/", async (req, res) => {
  try {
    const trip = await tripService.startTrip(req.body);
    res.status(201).json(trip);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:tripId/end", async (req, res) => {
  try {
    const trip = await tripService.endTrip(req.params.tripId);
    res.json(trip);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:tripId/pings", async (req, res) => {
  try {
    await locationService.recordPing({ tripId: req.params.tripId, ...req.body });
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:tripId/pings/batch", async (req, res) => {
  // Store-and-forward sync endpoint
  try {
    const pings = (req.body.pings ?? []).map((p: any) => ({ tripId: req.params.tripId, ...p }));
    await locationService.recordBatch(pings);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:tripId/route", async (req, res) => {
  try {
    const route = await locationService.getRouteForTrip(req.params.tripId);
    res.json(route);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:tripId/positions", async (req, res) => {
  // One point per active member - powers the live "where's everyone" map.
  try {
    const positions = await locationService.getLatestPositions(req.params.tripId);
    res.json(positions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:tripId/media", async (req, res) => {
  try {
    const media = await mediaService.getMediaForTrip(req.params.tripId);
    res.json(media);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:tripId/media", upload.single("photo"), async (req, res) => {
  // Real file upload now (multipart/form-data), not base64 in a JSON body -
  // this is what fixed the multi-minute waits and database timeouts.
  try {
    if (!req.file) return res.status(400).json({ error: "No photo was attached to the upload." });
    const media = await mediaService.uploadMedia({
      tripId: req.params.tripId,
      userId: req.body.userId,
      fileBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      capturedAt: req.body.capturedAt,
      lat: req.body.lat ? parseFloat(req.body.lat) : undefined,
      lng: req.body.lng ? parseFloat(req.body.lng) : undefined,
    });
    res.status(201).json(media);
  } catch (err: any) {
    console.error("Media upload failed:", err);
    res.status(500).json({ error: "Upload failed - please try again." }); // never show raw DB/storage errors to the user
  }
});

router.get("/:tripId/memory-stream", async (req, res) => {
  // Bare-bones v1: a route line + bubbles clustering media by
  // time/location proximity. No polish, no UI - just the data
  // shape the app will eventually render.
  try {
    const stream = await memoryStreamService.generate(req.params.tripId);
    res.json(stream);
  } catch (err: any) {
    console.error("Memory Stream generation failed:", err);
    res.status(500).json({ error: "Couldn't load the Memory Stream right now - please try again in a moment." });
  }
});

export default router;
