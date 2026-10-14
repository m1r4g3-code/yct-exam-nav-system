"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { toast } from "sonner"
import { ClipboardList, Navigation, BookMarked, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"
import { useLogout } from "@/hooks/use-user"

const NAV_ITEMS = [
  { label: "Timetable", href: "/dashboard", icon: ClipboardList },
  { label: "Navigate", href: "/navigate", icon: Navigation },
  { label: "Courses", href: "/courses", icon: BookMarked },
  { label: "Profile", href: "/profile", icon: User },
] as const

/** Set by the sign-up page just before it loads the portal (toasts don't survive a page load). */
const FLASH_TOAST_KEY = "yct_flash_toast"

function showFlashToast() {
  let raw: string | null = null
  try {
    raw = window.sessionStorage.getItem(FLASH_TOAST_KEY)
    window.sessionStorage.removeItem(FLASH_TOAST_KEY)
  } catch {
    return
  }
  if (!raw) return
  try {
    const flash = JSON.parse(raw) as { kind?: string; title?: string; description?: string }
    if (!flash.title) return
    const show = flash.kind === "success" ? toast.success : toast.info
    show(flash.title, { description: flash.description })
  } catch {
    // Ignore a malformed message.
  }
}

interface StudentShellProps {
  user: { email: string }
  children: React.ReactNode
}

export function StudentShell({ user, children }: StudentShellProps) {
  const pathname = usePathname()
  const handleLogout = useLogout()

  useEffect(() => {
    // Deferred so the app's toast container (mounted alongside this page) is listening.
    const timer = window.setTimeout(showFlashToast, 0)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop top navbar */}
      <header className="hidden md:flex fixed top-0 left-0 right-0 z-50 h-16 items-center justify-between border-b border-border bg-card px-6">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/yabatech-crest.png" alt="Yabatech crest" className="size-8 object-contain select-none" />
          <span className="text-sm font-semibold tracking-wide text-foreground">Exam Portal</span>
        </div>
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const active =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-brand/10 text-brand"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden lg:block">{user.email}</span>
          <ThemeToggle className="text-muted-foreground hover:text-foreground" />
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </header>

      {/* Page content */}
      <main className="pb-20 md:pb-0 md:pt-16">{children}</main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden border-t border-border bg-card">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 py-3 text-xs transition-colors"
            >
              <Icon className={cn("size-5", active ? "text-brand" : "text-muted-foreground")} />
              <span className={active ? "text-brand font-medium" : "text-muted-foreground"}>{label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
