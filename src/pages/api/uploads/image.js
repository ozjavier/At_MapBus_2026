import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  requireApiRole,
  jsonResponse,
  jsonError,
} from "../../../lib/apiHelpers.js";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "blog");
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  const formData = await context.request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!file || typeof file === "string")
    return jsonError("Archivo no valido", 400);
  if (!ALLOWED_TYPES.includes(file.type))
    return jsonError("Tipo de imagen no permitido", 400);
  if (file.size > 5 * 1024 * 1024)
    return jsonError("La imagen supera 5MB", 400);

  await mkdir(UPLOAD_DIR, { recursive: true });

  const ext = file.type.split("/")[1];
  const filename = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  return jsonResponse({ url: `/uploads/blog/${filename}` }, 201);
}
