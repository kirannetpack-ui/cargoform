import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";

const app = express();
const root = join(process.cwd(), "dist");
const index = join(root, "index.html");
const port = Number(process.env.PORT || 8080);

app.disable("x-powered-by");
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "DENY");
  next();
});

app.get(["/up", "/health", "/health/live", "/health/ready"], (_request, response) => {
  response.type("text/plain").send("OK");
});

app.use(express.static(root, { index: false }));
app.use((_request, response) => {
  if (!existsSync(index)) {
    response.status(503).type("text/plain").send("Application assets are unavailable");
    return;
  }
  response.sendFile(index);
});

app.listen(port, "0.0.0.0", () => console.log(`CargoForm web listening on ${port}`));
