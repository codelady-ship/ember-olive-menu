import * as React from "react"

/**
 * Two-step confirm inside the page, used instead of window.confirm(): the staff area also runs in a
 * sandboxed iframe without allow-modals, where browser dialogs are silently ignored.
 * First press: the button turns into "confirm / Cancel" for a few seconds. Escape or Cancel goes back.
 */
export function ConfirmButton({
  children,
  confirmLabel = "Yes, delete",
  question,
  onConfirm,
  timeout = 6000,
  className = "btn small",
}: {
  children: React.ReactNode
  confirmLabel?: string
  /** Read by screen readers when the second step appears, e.g. "Delete Espresso?" */
  question: string
  onConfirm: () => void | Promise<void>
  timeout?: number
  className?: string
}) {
  const [armed, setArmed] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const group = React.useRef<HTMLSpanElement>(null)
  const trigger = React.useRef<HTMLButtonElement>(null)
  const yes = React.useRef<HTMLButtonElement>(null)
  const armedAt = React.useRef(0)
  const refocus = React.useRef(false)

  const close = React.useCallback(() => {
    refocus.current = Boolean(group.current?.contains(document.activeElement))
    setArmed(false)
  }, [])

  React.useEffect(() => {
    if (!armed) {
      if (refocus.current) trigger.current?.focus()
      refocus.current = false
      return
    }
    armedAt.current = Date.now()
    yes.current?.focus()
    group.current?.scrollIntoView({ block: "nearest", inline: "nearest" }) // inside a scrolling table: show both buttons
    const t = window.setTimeout(close, timeout)
    return () => window.clearTimeout(t)
  }, [armed, timeout, close])

  if (!armed)
    return (
      <button ref={trigger} className={className} type="button" disabled={busy} onClick={() => setArmed(true)}>
        {children}
      </button>
    )

  const confirm = async () => {
    if (Date.now() - armedAt.current < 350) return // a double click or a held Enter key must not confirm
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
      close()
    }
  }

  return (
    <span ref={group} role="group" aria-label={question} className="confirm-pair" onKeyDown={(e) => e.key === "Escape" && close()}>
      <span className="sr-only" role="status">
        {question} Confirm or cancel.
      </span>
      <button ref={yes} className="btn small danger" type="button" disabled={busy} onClick={confirm}>
        {confirmLabel}
      </button>
      <button className="btn small" type="button" disabled={busy} onClick={close}>
        Cancel
      </button>
    </span>
  )
}
