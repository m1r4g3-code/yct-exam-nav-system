"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ThemeToggle } from "@/components/theme-toggle"
import { createClient } from "@/lib/supabase/client"

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

type LoginFormValues = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(values: LoginFormValues) {
    setIsSubmitting(true)
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

      router.refresh()
      if (role === "admin" || role === "superadmin") {
        router.push("/admin/dashboard")
      } else if (role === "student") {
        router.push("/dashboard")
      } else {
        toast.error("Account has no role assigned. Contact support.")
      }
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-8 w-full max-w-md shadow-sm">
      <div className="mb-6 relative">
        <div className="absolute top-0 right-0">
          <ThemeToggle />
        </div>
        <div className="flex flex-col items-center gap-3 pt-1">
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
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
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
