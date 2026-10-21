import { z } from "zod";
import { Id, Name, Timestamp } from "../common.js";
import { FileItem } from "./files.js";
import { route } from "../route.js";

/** Fixed part size. R2 requires equal non-final parts; 64 MiB x 10k parts = 640 GB ceiling. */
export const PART_SIZE = 64 * 1024 * 1024;
export const MAX_PARTS = 10_000;
export const MAX_FILE_BYTES = PART_SIZE * MAX_PARTS;

const VaultParams = z.object({ vaultId: Id });
const UploadParams = VaultParams.extend({ uploadId: z.string().min(1) });
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const uploadRoutes = {
  /** Step 1. If the blob already exists, dedup=true and the file row is created immediately. */
  create: route({
    method: "POST",
    path: "/vaults/:vaultId/uploads",
    auth: "session",
    status: 201,
    params: VaultParams,
    body: z.object({
      folderId: Id.nullable(),
      name: Name,
      size: z.number().int().positive().max(MAX_FILE_BYTES),
      mime: z.string().max(255).nullable(),
      sha256: Sha256,
    }),
    response: z.discriminatedUnion("dedup", [
      z.object({ dedup: z.literal(true), file: FileItem }),
      z.object({
        dedup: z.literal(false),
        uploadId: z.string(),
        key: z.string(),
        partSize: z.literal(PART_SIZE),
        partCount: z.number().int().positive(),
      }),
    ]),
    summary: "Begin multipart upload (membership check happens here)",
  }),
  /** Step 2, repeated. Client PUTs bytes straight to the bucket. */
  sign: route({
    method: "POST",
    path: "/vaults/:vaultId/uploads/:uploadId/sign",
    auth: "session",
    params: UploadParams,
    body: z.object({
      key: z.string(),
      partNumbers: z.array(z.number().int().min(1).max(MAX_PARTS)).min(1).max(100),
    }),
    response: z.object({
      urls: z.array(z.object({ partNumber: z.number().int(), url: z.string().url() })),
      expiresAt: Timestamp,
    }),
    summary: "Presigned PUT URLs for parts",
  }),
  /** Step 3. Server completes multipart, inserts blob + file, enqueues waveform job. */
  complete: route({
    method: "POST",
    path: "/vaults/:vaultId/uploads/:uploadId/complete",
    auth: "session",
    status: 201,
    params: UploadParams,
    body: z.object({
      key: z.string(),
      folderId: Id.nullable(),
      name: Name,
      mime: z.string().max(255).nullable(),
      sha256: Sha256,
      parts: z.array(z.object({ partNumber: z.number().int(), etag: z.string() })).min(1),
    }),
    response: FileItem,
    summary: "Finish upload; returns the file row",
  }),
  abort: route({
    method: "DELETE",
    path: "/vaults/:vaultId/uploads/:uploadId",
    auth: "session",
    status: 204,
    params: UploadParams,
    query: z.object({ key: z.string() }),
    response: z.object({}),
    summary: "Abort multipart upload",
  }),
};
