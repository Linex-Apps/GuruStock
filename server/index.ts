// Development server — runs on port 3001 behind the Vite proxy
import { handleApiRequest, initialize } from "./app";

const PORT = 3001;
const HOST = "0.0.0.0";

initialize();

console.log(`GuruStock API dev server running on http://${HOST}:${PORT}`);

Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch: handleApiRequest,
});
