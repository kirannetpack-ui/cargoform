import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "dist");
const port = Number(process.env.PORT || 8080);
const types = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
  if (pathname === "/" || pathname === "/up" || pathname === "/health" || pathname === "/health/live" || pathname === "/health/ready") {
    if (pathname !== "/") {
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Content-Length": "2" });
      response.end("OK");
      return;
    }
  }
  if (!existsSync(join(root, "index.html"))) {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Application assets are unavailable");
    return;
  }
  if (request.method === "HEAD") {
    response.writeHead(200);
    response.end();
    return;
  }
  const candidate = normalize(join(root, pathname));
  const safe = candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(root, "index.html");
  response.setHeader("Content-Type", types[extname(safe)] || "application/octet-stream");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "DENY");
  createReadStream(safe).pipe(response);
}).listen(port, "0.0.0.0", () => console.log(`CargoForm web listening on ${port}`));
