"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, Eye, EyeOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

type LoginFormValues = z.infer<typeof loginSchema>

/** Pages a student may be sent back to after signing in. */
const STUDENT_PAGES = ["/dashboard", "/courses", "/navigate", "/profile", "/register/courses"]

/**
 * Where to go after signing in. `redirectTo` is honoured only when it is a page on
 * this site that the user's role may open; anything else goes to the role's home page.
 */
function destinationFor(isAdmin: boolean, redirectTo: string | null): string {
  const home = isAdmin ? "/admin/dashboard" : "/dashboard"
  // Relative paths only — "//host" and "/\host" would leave the site.
  if (!redirectTo || !redirectTo.startsWith("/") || redirectTo.startsWith("//") || redirectTo.includes("\\")) {
    return home
  }

  let url: URL
  try {
    url = new URL(redirectTo, window.location.origin)
  } catch {
    return home
  }
  if (url.origin !== window.location.origin) return home

  const within = (base: string) => url.pathname === base || url.pathname.startsWith(`${base}/`)
  const allowed = isAdmin ? within("/admin") : STUDENT_PAGES.some(within)
  return allowed ? `${url.pathname}${url.search}${url.hash}` : home
}

function LoginForm() {
  const searchParams = useSearchParams()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(values: LoginFormValues) {
    setIsSubmitting(true)
    let navigating = false
    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      })

      if (error || !data.user) {
        toast.error(error?.message ?? "Invalid email or password")
        return
      }

      const role = data.user.app_metadata?.role as string | undefined
      if (role !== "admin" && role !== "superadmin" && role !== "student") {
        toast.error("Account has no role assigned. Please contact the exams office.")
        await supabase.auth.signOut()
        return
      }

      // A full page load (not router.refresh/replace): the proxy sends signed-in users
      // away from /login, so a refresh here would race with this navigation. Loading the
      // page afresh guarantees the new session cookie is sent and the portal renders fresh.
      navigating = true
      window.location.assign(destinationFor(role !== "student", searchParams.get("redirectTo")))
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      if (!navigating) setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          aria-invalid={!!errors.email}
          {...register("email")}
        />
        {errors.email && (
          <p className="text-sm text-destructive mt-1">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            className="pr-10"
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {errors.password && (
          <p className="text-sm text-destructive mt-1">{errors.password.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full mt-2" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  )
}

/** Same layout as the form, shown for the moment before the page's search params are available. */
function LoginFormFallback() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="space-y-1.5">
        <Label htmlFor="email-placeholder">Email</Label>
        <Input id="email-placeholder" type="email" placeholder="you@example.com" disabled />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password-placeholder">Password</Label>
        <Input id="password-placeholder" type="password" placeholder="••••••••" disabled />
      </div>
      <Button type="button" className="w-full mt-2" disabled>
        Sign in
      </Button>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="bg-card border border-border rounded-xl p-8 w-full max-w-md shadow-sm">
      <div className="mb-6">
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/yabatech-crest.png"
            alt="Yabatech crest"
            className="size-20 object-contain select-none drop-shadow-sm"
          />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground leading-tight">Exam Portal</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Yaba College of Technology</p>
          </div>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </div>
      </div>

      {/* useSearchParams (for ?redirectTo=) needs a Suspense boundary on a prerendered page */}
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm />
      </Suspense>

      <p className="text-sm text-muted-foreground mt-6 text-center">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="text-foreground/80 underline underline-offset-4 hover:text-foreground"
        >
          Register
        </Link>
      </p>
    </div>
  )
}
