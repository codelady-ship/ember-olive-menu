import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import multer from "multer"
import { HttpError } from "./http.js"

const TYPES: { [mime: string]: string } = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }

/** Check the file's first bytes, so a renamed script cannot pass as a picture. */
export function sniff(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg"
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png"
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp"
  return null
}

export function imageUpload(maxMb: number) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Math.round(maxMb * 1024 * 1024), files: 1, fields: 4 },
    fileFilter: (_req, file, cb) => {
      if (TYPES[file.mimetype]) cb(null, true)
      else cb(new HttpError(415, "Images must be JPEG, PNG or WebP."))
    },
  }).single("image")
}

/** Save under a name the server makes up; the client's file name is never used. */
export async function saveImage(dir: string, file: Express.Multer.File): Promise<string> {
  const ext = sniff(file.buffer)
  if (!ext || TYPES[file.mimetype] !== ext) throw new HttpError(415, "That file is not a JPEG, PNG or WebP image.")
  await fs.mkdir(dir, { recursive: true })
  const name = crypto.randomUUID() + "." + ext
  await fs.writeFile(path.join(dir, name), file.buffer, { flag: "wx" })
  return "/uploads/" + name
}
