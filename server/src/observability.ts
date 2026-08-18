import pino from "pino";
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { config } from "./config.js";

export const logger = pino({ level: config.LOG_LEVEL, redact: ["req.headers.authorization", "req.headers.cookie", "password", "token", "refreshToken", "encryptedTokens"] });
export const metrics = new Registry();
collectDefaultMetrics({ register: metrics, prefix: "cargoform_" });
export const httpRequests = new Counter({ name: "cargoform_http_requests_total", help: "HTTP request count", labelNames: ["method", "route", "status"], registers: [metrics] });
export const httpDuration = new Histogram({ name: "cargoform_http_request_duration_seconds", help: "HTTP request latency", labelNames: ["method", "route", "status"], registers: [metrics] });

