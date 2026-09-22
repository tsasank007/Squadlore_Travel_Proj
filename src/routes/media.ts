import { Router } from "express";
import { MediaService } from "../services/MediaService";

const router = Router();
const mediaService = new MediaService();

router.post("/:mediaId/comments", async (req, res) => {
  try {
    const comment = await mediaService.addComment(req.params.mediaId, req.body.userId, req.body.text);
    res.status(201).json(comment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:mediaId/comments", async (req, res) => {
  try {
    const comments = await mediaService.getComments(req.params.mediaId);
    res.json(comments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:mediaId/reactions", async (req, res) => {
  // Idempotent: picking a new emoji replaces the user's previous reaction.
  try {
    await mediaService.setReaction(req.params.mediaId, req.body.userId, req.body.emoji);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:mediaId/location", async (req, res) => {
  // Uploads no longer wait for GPS - this attaches the location afterward,
  // once (if) it resolves, so a photo can still land on the Memory Stream
  // map without making the person wait for the upload itself.
  try {
    await mediaService.updateLocation(req.params.mediaId, parseFloat(req.body.lat), parseFloat(req.body.lng));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:mediaId/reactions/:userId", async (req, res) => {
  try {
    await mediaService.removeReaction(req.params.mediaId, req.params.userId);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:mediaId/reactions", async (req, res) => {
  try {
    const summary = await mediaService.getReactionSummary(req.params.mediaId);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:mediaId/tags", async (req, res) => {
  try {
    await mediaService.tagMedia(req.params.mediaId, req.body.taggedUserId, req.body.place);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:mediaId/tags", async (req, res) => {
  try {
    const tags = await mediaService.getTagsForMedia(req.params.mediaId);
    res.json(tags);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
