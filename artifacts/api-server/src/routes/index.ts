import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import vendorsRouter from "./vendors";
import eventsRouter from "./events";
import bookingsRouter from "./bookings";
import reviewsRouter from "./reviews";
import availabilityRouter from "./availability";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(vendorsRouter);
router.use(eventsRouter);
router.use(bookingsRouter);
router.use(reviewsRouter);
router.use(availabilityRouter);
router.use(adminRouter);

export default router;
