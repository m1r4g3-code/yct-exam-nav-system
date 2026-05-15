import { useSyncExternalStore } from "react"

const MOBILE_BREAKPOINT = 768

// useSyncExternalStore avoids calling setState synchronously in an effect body
// (react-hooks/set-state-in-effect). The subscribe function wires up the media
// query change listener; getSnapshot reads the current viewport width.
export function useIsMobile() {
  return useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
      mql.addEventListener("change", callback)
      return () => mql.removeEventListener("change", callback)
    },
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false
  )
}
