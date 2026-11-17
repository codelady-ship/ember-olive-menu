import { DEMO_MENU, type Menu } from "./menu"

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

/**
 * Where the API lives. VITE_API_URL is set at build time. A `?api=` override is
 * honoured only while developing on localhost, so nobody can point the public
 * site at another server with a crafted link.
 */
export function apiBase(loc: { hostname: string; search: string } = window.location, envUrl = import.meta.env.VITE_API_URL as string | undefined): string {
  if (LOCAL_HOSTS.has(loc.hostname)) {
    const o = new URLSearchParams(loc.search).get("api")
    if (o && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return o
  }
  return (envUrl || "").replace(/\/+$/, "")
}

export const API = typeof window === "undefined" ? "" : apiBase()
export const hasApi = () => !!API

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details: { field: string; message: string }[] = [],
  ) {
    super(message)
  }
}

export async function request<T>(path: string, init: RequestInit & { timeoutMs?: number; token?: string } = {}): Promise<T> {
  if (!API) throw new ApiError(0, "This preview is not connected to the restaurant's server, so nothing was sent.")
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20_000)
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) }
  if (init.body && !(init.body instanceof FormData)) headers["Content-Type"] = "application/json"
  if (init.token) headers.Authorization = "Bearer " + init.token
  try {
    const res = await fetch(API + path, { ...init, headers, signal: ctrl.signal })
    if (res.status === 204) return undefined as T
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(res.status, body.error || "Something went wrong.", body.details || [])
    return body as T
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError(0, (e as Error).name === "AbortError" ? "The server took too long to answer. Please try again." : "We could not reach the server. Please try again.")
  } finally {
    window.clearTimeout(timer)
  }
}

export const post = <T>(path: string, body: unknown, token?: string) => request<T>(path, { method: "POST", body: JSON.stringify(body), token })

/**
 * The menu for the book. Falls back to the built-in demo menu when there is no
 * API, or when it does not answer within 8 seconds (a sleeping free-tier host).
 */
export async function loadMenu(timeoutMs = 8000): Promise<{ menu: Menu; demo: boolean }> {
  if (!API) return { menu: DEMO_MENU, demo: true }
  try {
    const menu = await request<Menu>("/api/menu", { timeoutMs })
    if (!menu?.sections?.length) return { menu: DEMO_MENU, demo: true }
    return { menu, demo: false }
  } catch {
    return { menu: DEMO_MENU, demo: true }
  }
}

/**
 * Turn a stored media path into a URL: site assets (menu/…, promo/…) resolve
 * against the Vite base, uploads against the API, https URLs pass through.
 */
export function mediaUrl(p: string): string {
  if (!p) return ""
  if (/^https:\/\//.test(p)) return p
  if (p.startsWith("/uploads/")) return API ? API + p : ""
  if (/^(menu|promo)\/[a-z0-9-]+\.(webp|png|jpg|mp4)$/.test(p)) return import.meta.env.BASE_URL + p
  return ""
}
