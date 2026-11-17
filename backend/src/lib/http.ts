import crypto from "node:crypto"
import type { NextFunction, Request, Response } from "express"
import { ZodError, type ZodTypeAny, type z } from "zod"

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

/** Parse a body or query with zod; a failure becomes a 400 with field messages. */
export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data)
  if (!r.success) throw new HttpError(400, "Please check the highlighted fields.", fieldErrors(r.error))
  return r.data
}

export const fieldErrors = (e: ZodError) => e.issues.map((i) => ({ field: i.path.join("."), message: i.message }))

/** Wrap an async handler so a thrown error reaches the error middleware. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
/** A short, unambiguous reference such as "EO-7KQ2MX". */
export function code(prefix: string): string {
  const b = crypto.randomBytes(6)
  let s = ""
  for (const x of b) s += ALPHABET[x % ALPHABET.length]
  return prefix + "-" + s
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
