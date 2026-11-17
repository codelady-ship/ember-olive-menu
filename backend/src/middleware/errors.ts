import type { NextFunction, Request, Response } from "express"
import mongoose from "mongoose"
import multer from "multer"
import { ZodError } from "zod"
import { HttpError, fieldErrors } from "../lib/http.js"

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found." })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details })
  if (err instanceof ZodError) return res.status(400).json({ error: "Please check the highlighted fields.", details: fieldErrors(err) })
  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400
    return res.status(status).json({ error: err.code === "LIMIT_FILE_SIZE" ? "That image is too large." : "Upload one image in the field \"image\"." })
  }
  if (err instanceof mongoose.Error.CastError) return res.status(400).json({ error: "Invalid id." })
  if (err instanceof mongoose.Error.ValidationError) return res.status(400).json({ error: "Please check the highlighted fields." })
  if ((err as { code?: number })?.code === 11000) return res.status(409).json({ error: "That already exists." })
  if ((err as { type?: string })?.type === "entity.too.large") return res.status(413).json({ error: "Request too large." })
  if ((err as { type?: string })?.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON." })
  if (process.env.NODE_ENV !== "test") console.error("[api] unexpected error:", (err as Error)?.message)
  res.status(500).json({ error: "Something went wrong on our side." })
}
