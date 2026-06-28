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
import stripeRouter from "./stripe";
import usersRouter from "./users";
import adminRouter from "./admin";

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
router.use("/stripe", stripeRouter);
router.use("/users", usersRouter);
router.use("/admin", adminRouter);

export default router;
