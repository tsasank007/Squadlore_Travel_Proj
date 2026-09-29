import { Router } from "express";
import multer from "multer";
import { UserService } from "../services/UserService";

const router = Router();
const userService = new UserService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// MVP only - no phone/SMS verification yet. This lets us create
// test users for the end-to-end loop; real auth is a Phase 1
// task before any real user data touches this.
router.post("/", async (req, res) => {
  try {
    const user = await userService.findOrCreateByPhone(req.body);
    res.status(201).json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:userId/avatar", upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image was attached." });
    const user = await userService.setAvatar(req.params.userId, req.file.buffer, req.file.mimetype);
    res.json(user);
  } catch (err: any) {
    console.error("Avatar upload failed:", err);
    res.status(500).json({ error: "Couldn't save that photo - please try again." });
  }
});

export default router;
