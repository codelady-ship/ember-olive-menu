import * as React from "react"
import Site from "./Site"

const Admin = React.lazy(() => import("./admin/Admin"))

/** Hash routing keeps GitHub Pages happy: #/admin is the staff area. */
export default function App() {
  const [hash, setHash] = React.useState(() => window.location.hash)
  React.useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [])
  if (hash.startsWith("#/admin"))
    return (
      <React.Suspense fallback={<p style={{ padding: 24 }}>Loading…</p>}>
        <Admin />
      </React.Suspense>
    )
  return <Site />
}
