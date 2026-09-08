import { createApi } from "./api.mjs";
import catalog from "../.generated/catalog.json";
const handle = createApi({ catalog });
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handle(request, env.DB);
    return env.ASSETS.fetch(request);
  },
};
