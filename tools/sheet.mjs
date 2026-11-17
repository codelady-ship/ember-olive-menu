import sharp from "sharp"
import fs from "node:fs"
const files = process.argv.slice(3), out = process.argv[2], S = 300
const cols = 4, rows = Math.ceil(files.length / cols)
const comps = await Promise.all(files.map(async (f, i) => ({ input: await sharp(f).resize(S, S, { fit: "contain", background: "#888" }).toBuffer(), left: (i % cols) * S, top: Math.floor(i / cols) * S })))
await sharp({ create: { width: cols * S, height: rows * S, channels: 3, background: "#888" } }).composite(comps).jpeg({ quality: 80 }).toFile(out)
