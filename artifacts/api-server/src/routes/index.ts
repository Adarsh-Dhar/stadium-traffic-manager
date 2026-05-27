import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fifaRouter from "./fifa";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fifaRouter);

export default router;
