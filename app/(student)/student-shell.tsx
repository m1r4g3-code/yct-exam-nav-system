"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ClipboardList, Navigation, BookMarked, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useQueryClient } from "@tanstack/react-query"

const NAV_ITEMS = [
  { label: "Timetable", href: "/dashboard", icon: ClipboardList },
  { label: "Navigate", href: "/navigate", icon: Navigation },
  { label: "Courses", href: "/courses", icon: BookMarked },
  { label: "Profile", href: "/profile", icon: User },
] as const

interface StudentShellProps {
  user: { email: string }
  children: React.ReactNode
}

export function StudentShell({ user, children }: StudentShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    queryClient.clear()
    router.push("/login")
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop top navbar */}
      <header className="hidden md:flex fixed top-0 left-0 right-0 z-50 h-16 items-center justify-between border-b border-border bg-card px-6">
        <span className="text-sm font-semibold tracking-wide text-foreground">
          YCT Exam Portal
        </span>
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
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-muted text-foreground"
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
              className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs transition-colors"
            >
              <Icon className={cn("size-5", active ? "text-foreground" : "text-muted-foreground")} />
              <span className={active ? "text-foreground" : "text-muted-foreground"}>{label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
