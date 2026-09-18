import { Router } from "express";
import { z } from "zod";
import { PackService } from "../services/PackService";
import { TripService } from "../services/TripService";

const router = Router();
const packService = new PackService();
const tripService = new TripService();

const createPackSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional(),
  color: z.string().optional(),
  creatorId: z.string().uuid(),
  isPersistent: z.boolean().optional(),
});

// Route handlers stay thin on purpose: parse + validate input,
// call a service method, return the result. All real logic lives
// in the service classes so it's testable and portable.

router.post("/", async (req, res) => {
  const parsed = createPackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const pack = await packService.createPack(parsed.data);
    res.status(201).json(pack);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:packId/members", async (req, res) => {
  const { packId } = req.params;
  const { userId, role } = req.body;

  try {
    await packService.addMember(packId, userId, role);
    res.status(204).send();
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.patch("/:packId/members/:userId/status", async (req, res) => {
  const { packId, userId } = req.params;
  const { status } = req.body; // "active" | "paused" | "offline"

  try {
    await packService.setMemberStatus(packId, userId, status);
    res.status(204).send();
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/", async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: "userId query param required" });

  try {
    const packs = await packService.listPacksForUser(userId);
    res.json(packs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:packId/members", async (req, res) => {
  try {
    const members = await packService.listMembers(req.params.packId);
    res.json(members);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:packId/trips", async (req, res) => {
  try {
    const trips = await tripService.listTripsForPack(req.params.packId);
    res.json(trips);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
