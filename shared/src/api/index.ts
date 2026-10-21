import { authRoutes } from "./auth.js";
import { vaultRoutes } from "./vaults.js";
import { folderRoutes } from "./folders.js";
import { fileRoutes } from "./files.js";
import { uploadRoutes } from "./uploads.js";
import { shareRoutes } from "./shares.js";

export const routes = {
  auth: authRoutes,
  vaults: vaultRoutes,
  folders: folderRoutes,
  files: fileRoutes,
  uploads: uploadRoutes,
  shares: shareRoutes,
} as const;
