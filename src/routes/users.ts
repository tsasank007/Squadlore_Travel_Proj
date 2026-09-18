import { Router } from "express";
import { UserService } from "../services/UserService";

const router = Router();
const userService = new UserService();

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

export default router;
