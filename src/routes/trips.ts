import { Router } from "express";
import { TripService } from "../services/TripService";
import { LocationService } from "../services/LocationService";
import { MediaService } from "../services/MediaService";
import { MemoryStreamService } from "../services/MemoryStreamService";

const router = Router();
const tripService = new TripService();
const locationService = new LocationService();
const mediaService = new MediaService();
const memoryStreamService = new MemoryStreamService();

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

router.get("/:tripId/media", async (req, res) => {
  try {
    const media = await mediaService.getMediaForTrip(req.params.tripId);
    res.json(media);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:tripId/media", async (req, res) => {
  // MVP note: this expects `url` to already point at an uploaded file
  // (e.g. a Supabase Storage URL). The mobile app uploads the raw
  // file to storage first, then calls this to register it against
  // the trip. Swapping storage providers later only touches the
  // upload step on the client, not this record-keeping call.
  try {
    const media = await mediaService.uploadMedia({ tripId: req.params.tripId, ...req.body });
    res.status(201).json(media);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

export default router;
