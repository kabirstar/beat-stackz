// Generates contracts/openapi.json from the zod route definitions.
// Run: pnpm openapi   (CI fails if the committed file is stale)
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { routes, ApiError } from "../src/index.js";
import type { Route } from "../src/route.js";

const json = (schema: z.ZodTypeAny) => z.toJSONSchema(schema, { target: "openapi-3.0", io: "output" });
const jsonIn = (schema: z.ZodTypeAny) => z.toJSONSchema(schema, { target: "openapi-3.0", io: "input" });

const paths: Record<string, Record<string, unknown>> = {};
const security = { session: [{ cookieAuth: [] }], "share-token": [{ cookieAuth: [] }, {}], public: [] as unknown[] };

for (const [group, defs] of Object.entries(routes)) {
  for (const [name, r] of Object.entries(defs) as [string, Route][]) {
    const path = r.path.replace(/:(\w+)/g, "{$1}");
    const params = [
      ...Object.entries(r.params?.shape ?? {}).map(([n]) => ({ name: n, in: "path", required: true, schema: { type: "string" } })),
      ...Object.entries(r.query?.shape ?? {}).map(([n, s]) => ({
        name: n,
        in: "query",
        required: !(s as z.ZodTypeAny).safeParse(undefined).success,
        schema: jsonIn(s as z.ZodTypeAny),
      })),
    ];
    const status = String(r.status ?? 200);
    (paths[path] ??= {})[r.method.toLowerCase()] = {
      operationId: `${group}.${name}`,
      summary: r.summary,
      tags: [group],
      security: security[r.auth],
      parameters: params,
      ...(r.body ? { requestBody: { required: true, content: { "application/json": { schema: jsonIn(r.body) } } } } : {}),
      responses: {
        [status]: status === "204" ? { description: "No content" } : { description: "OK", content: { "application/json": { schema: json(r.response) } } },
        "4XX": { description: "Error", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
      },
    };
  }
}

const doc = {
  openapi: "3.0.3",
  info: { title: "Beat Stackz API", version: "0.0.0", description: "Generated from shared/src/api/*. Do not edit by hand." },
  servers: [{ url: "http://localhost:4000" }],
  components: {
    securitySchemes: { cookieAuth: { type: "apiKey", in: "cookie", name: "better-auth.session_token" } },
    schemas: { ApiError: json(ApiError) },
  },
  paths,
};

const out = resolve(import.meta.dirname, "../../contracts/openapi.json");
mkdirSync(resolve(out, ".."), { recursive: true });
writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");
console.log(`wrote ${out} (${Object.keys(paths).length} paths)`);
