import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import healthRouter from "./health";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use("/api", healthRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

describe("API liveness monitoring", () => {
  it.each(["/api", "/api/", "/api/healthz"])("returns 200 from %s", async (path) => {
    const response = await fetch(`${baseUrl}${path}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});