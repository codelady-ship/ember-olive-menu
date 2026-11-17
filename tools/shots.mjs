/**
 * Visual checks: screenshots at phone / tablet / desktop / wide, plus checks for
 * horizontal overflow, small touch targets, console errors and text that spills
 * out of a book page.
 *   node shots.mjs [baseUrl] [outDir]
 */
import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright"

const BASE = process.argv[2] || "http://localhost:4173/ember-olive-menu/"
const OUT = process.argv[3] || "out/shots"
fs.mkdirSync(OUT, { recursive: true })
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7)

const VIEWS = [
  { name: "phone", width: 390, height: 844, mobile: true },
  { name: "tablet", width: 768, height: 1024, mobile: true },
  { name: "desktop", width: 1280, height: 800 },
  { name: "wide", width: 1920, height: 1080 },
]
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const report = []

const exe = process.env.CHROME_PATH
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] })

async function checks(page, label) {
  const r = await page.evaluate(() => {
    const over = document.documentElement.scrollWidth - window.innerWidth
    // visible interactive things smaller than 44px
    const small = []
    for (const el of document.querySelectorAll("a,button,input,select,textarea,summary")) {
      const b = el.getBoundingClientRect()
      const st = getComputedStyle(el)
      if (!b.width || !b.height || st.visibility === "hidden" || el.closest("[inert]") || el.closest(".hp")) continue
      if (b.bottom < 0 || b.top > innerHeight) continue
      if (el.type === "checkbox" || el.type === "radio") continue
      if (b.height < 43.5 && !(el.tagName === "A" && st.display === "inline")) small.push((el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30) + " " + Math.round(b.width) + "x" + Math.round(b.height))
    }
    // text spilling past the bottom of a visible page
    const spill = []
    for (const face of document.querySelectorAll(".eo-face.eo-page:not([inert])")) {
      const fb = face.getBoundingClientRect()
      const inner = face.querySelector(".eo-in")
      if (!inner) continue
      for (const el of inner.children) {
        if (el.classList.contains("eo-folio-n") || el.classList.contains("eo-run")) continue
        const b = el.getBoundingClientRect()
        if (b.bottom > fb.bottom - fb.height * 0.06 + 1) spill.push(face.dataset.pg + ":" + el.className + " +" + Math.round(b.bottom - (fb.bottom - fb.height * 0.06)))
      }
    }
    return { over, small: small.slice(0, 8), spill }
  })
  report.push({ label, ...r })
}

/** wait until no leaf is mid-turn (headless software WebGL can run at a few fps) */
async function settled(page) {
  let prev = ""
  for (let i = 0; i < 60; i++) {
    const cur = await page.evaluate(() => [...document.querySelectorAll(".eo-leaf")].map((l) => getComputedStyle(l).transform).join("|") + scrollY)
    if (cur === prev) return
    prev = cur
    await wait(400)
  }
}

async function isSingle(page) {
  return page.evaluate(() => /^p. /.test(document.body.innerText.match(/pp?. d+(–d+)? of d+/)?.[0] || ""))
}

async function goToPage(page, n) {
  // turn with the keyboard: the book scrolls the window there
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("ArrowRight")
    await wait(900)
    await settled(page)
  }
}

for (const v of VIEWS) {
  if (only && v.name !== only) continue
  for (const reduced of [false, true]) {
    if (reduced && v.name !== "phone" && v.name !== "desktop") continue
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1, isMobile: !!v.mobile, hasTouch: !!v.mobile, reducedMotion: reduced ? "reduce" : "no-preference" })
    const page = await ctx.newPage()
    page.setDefaultTimeout(90_000)
    const errors = []
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
    page.on("pageerror", (e) => errors.push(String(e)))
    const tag = v.name + (reduced ? "-reduced" : "")
    await page.goto(BASE, { waitUntil: "networkidle" })
    if (!reduced) {
      await wait(700)
      await page.screenshot({ path: path.join(OUT, tag + "-1-cover-closed.png") })
    }
    await wait(reduced ? 2500 : 5200)
    await page.screenshot({ path: path.join(OUT, tag + "-2-open-contents.png") })
    await checks(page, tag + " contents")
    // first featured spread (phone: the dish photo is page 3, i.e. two turns)
    await goToPage(page, (await isSingle(page)) ? 3 : 1)
    await wait(1200)
    await page.screenshot({ path: path.join(OUT, tag + "-3-dish-arrive.png") })
    await wait(2600)
    await page.screenshot({ path: path.join(OUT, tag + "-4-dish-risen.png") })
    await checks(page, tag + " dish")
    if (!reduced && v.name !== "phone") {
      // the drink
      await goToPage(page, (await isSingle(page)) ? 6 : 3)
      await wait(3600)
      await page.screenshot({ path: path.join(OUT, tag + "-5-drink-risen.png") })
      // text pages of the menu
      await goToPage(page, 1)
      await wait(1500)
      await page.screenshot({ path: path.join(OUT, tag + "-6-menu-pages.png") })
      await checks(page, tag + " menu pages")
      await goToPage(page, 1)
      await wait(1500)
      await checks(page, tag + " menu pages 2")
      await goToPage(page, 1)
      await wait(1500)
      await checks(page, tag + " menu pages 3")
      await goToPage(page, 2)
      await wait(1500)
      await page.screenshot({ path: path.join(OUT, tag + "-7-closing.png") })
      await checks(page, tag + " closing")
    }
    // 3D viewer from the first dish
    if (!reduced) {
      await page.goto(BASE, { waitUntil: "networkidle" })
      await wait(5200)
      await goToPage(page, (await isSingle(page)) ? 3 : 1)
      await wait(1800)
      const btn = page.locator(".eo-face:not([inert]) button", { hasText: "View in 3D" }).first()
      if (await btn.count()) {
        await btn.click()
        await wait(3500)
        await page.screenshot({ path: path.join(OUT, tag + "-8-viewer.png") })
        // drag to turn
        const st = page.locator(".viewer-stage")
        const b = await st.boundingBox()
        if (b) {
          await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
          await page.mouse.down()
          await page.mouse.move(b.x + b.width / 2 + 220, b.y + b.height / 2 - 40, { steps: 12 })
          await page.mouse.up()
          await wait(800)
          await page.screenshot({ path: path.join(OUT, tag + "-9-viewer-turned.png") })
        }
        await page.keyboard.press("Escape")
      }
    }
    // the page below the book
    await page.evaluate(() => document.getElementById("menu").scrollIntoView())
    await wait(600)
    await page.screenshot({ path: path.join(OUT, tag + "-10-full-menu.png") })
    await checks(page, tag + " full menu")
    await page.evaluate(() => document.getElementById("reserve").scrollIntoView())
    await wait(500)
    await page.screenshot({ path: path.join(OUT, tag + "-11-reserve.png") })
    await checks(page, tag + " reserve")
    report.push({ label: tag + " errors", errors })
    await ctx.close()
  }
}
await browser.close()
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2))
for (const r of report) {
  if (r.errors) console.log(r.label, r.errors.length ? r.errors.slice(0, 5) : "none")
  else console.log(r.label, "overflow", r.over, "small", r.small.length ? r.small : "-", "spill", r.spill.length ? r.spill : "-")
}
