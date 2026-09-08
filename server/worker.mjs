import { createApi } from "./api.mjs";
import { recoverJobs } from "./jobs.mjs";
import catalog from "../.generated/catalog.json";
// These headers are trusted only at the Sites gateway, never in local serve.
const handle = createApi({
  catalog,
  accountForRequest(request) {
    const id = request.headers.get("oai-authenticated-user-id");
    return id ? { id, name: "探索者" } : null;
  },
});
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (env.DB && request.method === "GET") await recoverJobs(env.DB);
      return handle(request, env.DB);
    }
    return env.ASSETS.fetch(request);
  },
};
