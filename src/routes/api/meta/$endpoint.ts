import { createFileRoute } from "@tanstack/react-router";
import { handleMetaApiRequest } from "../../../vortex/lib/metaServer";

const handleRequest = ({ request, params }: { request: Request; params: { endpoint: string } }) =>
  handleMetaApiRequest(request, params.endpoint);

export const Route = createFileRoute("/api/meta/$endpoint")({
  server: {
    handlers: {
      GET: handleRequest,
      POST: handleRequest,
      PUT: handleRequest,
      DELETE: handleRequest,
    },
  },
});
