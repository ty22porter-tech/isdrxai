import { Router, type IRouter } from "express";
import healthRouter from "./health";
import prospectsRouter from "./prospects";
import campaignsRouter from "./campaigns";
import emailsRouter from "./emails";
import callsRouter from "./calls";
import appointmentsRouter from "./appointments";
import statsRouter from "./stats";
import aiRouter from "./ai";
import openaiRouter from "./openai";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/prospects", prospectsRouter);
router.use("/campaigns", campaignsRouter);
router.use("/emails", emailsRouter);
router.use("/calls", callsRouter);
router.use("/appointments", appointmentsRouter);
router.use("/stats", statsRouter);
router.use("/ai", aiRouter);
router.use("/openai", openaiRouter);

export default router;
