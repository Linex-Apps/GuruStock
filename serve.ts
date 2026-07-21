// Production server for GuruStock. Serves the built Vite frontend and API
// from a single Bun server on port 3000, replacing any existing listener.
import { handleApiRequest, initialize } from "./server/app";

const PORT = 3000;
const HOST = "0.0.0.0";
const CLIENT_DIR = `${import.meta.dir}/dist`;

// Free PORT regardless of which user owns the current listener.
const freePort =
  `for _ in $(seq 1 25); do ` +
  `pids=$(lsof -t -iTCP:${String(PORT)} -sTCP:LISTEN 2>/dev/null || true); ` +
  `if [ -z "$pids" ]; then exit 0; fi; ` +
  `kill $pids 2>/dev/null || true; sleep 0.2; ` +
  `done`;

// Initialize DB (migrations, seed)
initialize();

// Take over the port, re-freeing and retrying on race
for (let attempt = 1; ; attempt++) {
  await Bun.$`sudo sh -c ${freePort}`.quiet().nothrow();
  try {
    Bun.serve({
      port: PORT,
      hostname: HOST,
      async fetch(req) {
        const { pathname } = new URL(req.url);

        // API routes
        if (pathname.startsWith("/api/")) {
          return handleApiRequest(req);
        }

        // Static files from Vite build
        const filePath = pathname === "/" ? "/index.html" : pathname;
        const file = Bun.file(CLIENT_DIR + filePath);
        if (await file.exists()) return new Response(file);

        // SPA fallback — serve index.html for client-side routing
        const fallback = Bun.file(CLIENT_DIR + "/index.html");
        if (await fallback.exists()) return new Response(fallback);

        return new Response("Not found", { status: 404 });
      },
    });
    break;
  } catch (err) {
    if (attempt >= 10) throw err;
    await Bun.sleep(200);
  }
}

console.log(`GuruStock serving on http://${HOST}:${String(PORT)}`);
