import { handleApi } from "@/server/api/http";

/**
 * The REST API. Every address under /api/v1 lands here; the table of routes
 * is in src/server/api/routes.ts and is listed by GET /api/v1.
 */
type Params = { params: Promise<{ path?: string[] }> };

const handle = async (request: Request, { params }: Params) =>
  handleApi(request, (await params).path ?? []);

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
