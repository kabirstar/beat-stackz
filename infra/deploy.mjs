// Trigger a Coolify deployment and wait for it (ADR 0005). No dependencies.
//   node infra/deploy.mjs                       # deploy the app named by COOLIFY_APP_UUID at its configured branch (main)
//   node infra/deploy.mjs --commit <sha>        # rollback/forward to a specific commit
// Env: COOLIFY_URL (e.g. http://2.29.96.215:8000), COOLIFY_TOKEN (API token, read+deploy), COOLIFY_APP_UUID.
const { COOLIFY_URL, COOLIFY_TOKEN, COOLIFY_APP_UUID } = process.env;
for (const k of ["COOLIFY_URL", "COOLIFY_TOKEN", "COOLIFY_APP_UUID"]) if (!process.env[k]) { console.error(`${k} is required`); process.exit(2); }
const commit = process.argv.includes("--commit") ? process.argv[process.argv.indexOf("--commit") + 1] : null;
const base = COOLIFY_URL.replace(/\/$/, "");
const headers = { Authorization: `Bearer ${COOLIFY_TOKEN}`, Accept: "application/json", "Content-Type": "application/json" };
const api = async (method, path, body) => {
  const res = await fetch(base + path, { method, headers, body: body && JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
};

if (commit) {
  // Coolify deploys the configured branch; pin the commit on the app, deploy, then unpin so the next push deploys HEAD again.
  await api("PATCH", `/api/v1/applications/${COOLIFY_APP_UUID}`, { git_commit_sha: commit });
}
const started = await api("POST", `/api/v1/deploy?uuid=${COOLIFY_APP_UUID}&force=${commit ? "true" : "false"}`);
const dep = started?.deployments?.[0];
if (!dep?.deployment_uuid) throw new Error(`unexpected deploy response: ${JSON.stringify(started).slice(0, 300)}`);
console.log(`deployment ${dep.deployment_uuid} queued (${dep.message ?? ""})`);

const deadline = Date.now() + 25 * 60_000;
let status = "queued";
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 15_000));
  const d = await api("GET", `/api/v1/deployments/${dep.deployment_uuid}`);
  if (d.status !== status) { status = d.status; console.log(`status: ${status}`); }
  if (status === "finished" || status === "failed" || status.startsWith("cancelled")) {
    if (status !== "finished") {
      try { for (const l of JSON.parse(d.logs).slice(-15)) console.error(l.output); } catch { /* logs not JSON */ }
    }
    break;
  }
}
if (commit) await api("PATCH", `/api/v1/applications/${COOLIFY_APP_UUID}`, { git_commit_sha: "HEAD" }).catch((e) => console.warn(`unpin failed: ${e.message}`));
if (status !== "finished") { console.error(`::error::deployment ended with status ${status}`); process.exit(1); }
console.log("deployment finished");
