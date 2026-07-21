import type { Request } from "bun";

export async function handlePortfolio(req: Request): Promise<Response> {
  if (req.method === "GET") {
    return Response.json({ message: "Portfolio endpoint — implement" }, { status: 501 });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
