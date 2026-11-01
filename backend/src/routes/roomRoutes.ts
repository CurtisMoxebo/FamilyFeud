import { Router } from 'express';
import { createRoom, getRoomByCode } from '../controllers/roomController';
import { validateRequest } from '../middleware/validate';
import { createRoomSchema, roomCodeParamSchema } from '../validators/roomValidator';

const router = Router();

// POST /api/rooms - Create a new game room session
router.post(
  '/',
  validateRequest({ body: createRoomSchema }),
  createRoom
);

// GET /api/rooms/:roomCode - Fetch room details by room code
router.get(
  '/:roomCode',
  validateRequest({ params: roomCodeParamSchema }),
  getRoomByCode
);

export default router;

