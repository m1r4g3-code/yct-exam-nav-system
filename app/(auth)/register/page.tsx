"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { useForm, useWatch, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, Eye, EyeOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { QUERY_KEYS } from "@/lib/query-keys"
import { ApiError, apiGet, apiSend, errorMessage } from "@/lib/fetcher"
import { MATRIC_FORMAT_HINT, isValidMatric, normaliseMatric } from "@/lib/matric"
import { useActiveSessions } from "@/hooks/use-selected-session"

const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(255, "Full name is too long"),
    matricNumber: z
      .string()
      .trim()
      .min(1, "Enter your matric number")
      .refine(isValidMatric, MATRIC_FORMAT_HINT),
    email: z.string().trim().email("Enter a valid email address"),
    departmentId: z.string().min(1, "Select your department"),
    programmeId: z.string().min(1, "Select a programme"),
    levelId: z.string().min(1, "Select a level"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

type RegisterFormValues = z.infer<typeof registerSchema>

/** Form fields the sign-up API can report errors for. */
const SERVER_FIELDS = [
  "fullName",
  "matricNumber",
  "email",
  "departmentId",
  "programmeId",
  "levelId",
  "password",
] as const satisfies readonly (keyof RegisterFormValues)[]
type ServerField = (typeof SERVER_FIELDS)[number]
const isServerField = (field: string): field is ServerField =>
  (SERVER_FIELDS as readonly string[]).includes(field)

type Department = {
  id: string
  name: string
  code: string
  school?: { name: string; code?: string } | null
}
type Programme = { id: string; name: string }
type Level = { id: string; name: string }

/** "Computer Technology (SOT)" — the school code tells apart departments with similar names. */
function departmentLabel(d: Department): string {
  const school = d.school?.code || d.school?.name
  return school ? `${d.name} (${school})` : d.name
}

/** Read and shown once by the student portal shell after the next page load. */
const FLASH_TOAST_KEY = "yct_flash_toast"

function saveFlashToast(toastData: { kind: "success" | "info"; title: string; description: string }) {
  try {
    window.sessionStorage.setItem(FLASH_TOAST_KEY, JSON.stringify(toastData))
  } catch {
    // Storage unavailable — the student simply doesn't see the message.
  }
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-sm text-destructive mt-1">{message}</p>
}

function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <p className="text-sm text-destructive mt-1">
      Couldn&apos;t load {what}.{" "}
      <button type="button" onClick={onRetry} className="underline underline-offset-2 hover:no-underline">
        Try again
      </button>
    </p>
  )
}

export default function RegisterPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Newest active session first — new students are enrolled into it on the next step.
  const activeSessions = useActiveSessions()

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      matricNumber: "",
      email: "",
      departmentId: "",
      programmeId: "",
      levelId: "",
      password: "",
      confirmPassword: "",
    },
  })

  const departmentId = useWatch({ control, name: "departmentId" })
  const programmeId = useWatch({ control, name: "programmeId" })

  const departmentsQuery = useQuery({
    queryKey: QUERY_KEYS.DEPARTMENTS(),
    queryFn: () => apiGet<Department[]>("/api/departments"),
    staleTime: 5 * 60 * 1000,
  })
  const programmesQuery = useQuery({
    queryKey: QUERY_KEYS.PROGRAMMES(departmentId),
    queryFn: () =>
      apiGet<Programme[]>(`/api/programmes?department_id=${encodeURIComponent(departmentId)}`),
    enabled: !!departmentId,
    staleTime: 5 * 60 * 1000,
  })
  const levelsQuery = useQuery({
    queryKey: QUERY_KEYS.LEVELS(programmeId),
    queryFn: () => apiGet<Level[]>(`/api/levels?programme_id=${encodeURIComponent(programmeId)}`),
    enabled: !!programmeId,
    staleTime: 5 * 60 * 1000,
  })

  const departments = departmentsQuery.data ?? []
  const programmes = programmesQuery.data ?? []
  const levels = levelsQuery.data ?? []

  /** Puts the server's field errors under the matching fields; everything else becomes a toast. */
  function showServerError(err: unknown) {
    if (!(err instanceof ApiError)) {
      toast.error(errorMessage(err))
      return
    }
    let marked = false
    for (const fieldError of err.errors ?? []) {
      if (isServerField(fieldError.field)) {
        setError(fieldError.field, { type: "server", message: fieldError.message })
        marked = true
      }
    }
    if (err.status === 409) {
      const field = /matric/i.test(err.message) ? "matricNumber" : /email/i.test(err.message) ? "email" : null
      if (field) setError(field, { type: "server", message: err.message })
      toast.error(err.message)
      return
    }
    toast.error(marked ? "Please check the highlighted fields." : errorMessage(err))
  }

  async function onSubmit(values: RegisterFormValues) {
    setIsSubmitting(true)
    let navigating = false
    try {
      try {
        await apiSend("/api/auth/register", "POST", {
          email: values.email,
          password: values.password,
          fullName: values.fullName,
          matricNumber: normaliseMatric(values.matricNumber),
          programmeId: values.programmeId,
          levelId: values.levelId,
        })
      } catch (err) {
        showServerError(err)
        return
      }

      // Sign in immediately so the next page can load the student's profile and enrol them.
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      })
      if (signInError) {
        toast.error("Account created, but signing in failed — please sign in.")
        navigating = true
        router.replace("/login")
        return
      }

      // A full page load (not router.refresh/replace): the proxy sends signed-in users away
      // from /register, and a fresh load guarantees the new session cookie is sent.
      // Toasts don't survive a page load, so the next page shows them (see StudentShell).
      const sessions = activeSessions.data ?? (await activeSessions.refetch()).data
      navigating = true
      if (sessions === undefined) {
        // Sessions couldn't be loaded — the Courses tab lets the student enrol later.
        saveFlashToast({
          kind: "success",
          title: "Account created",
          description: "Choose your courses from the Courses tab.",
        })
        window.location.assign("/courses")
      } else if (sessions.length === 0) {
        saveFlashToast({
          kind: "info",
          title: "Course registration isn't open yet",
          description: "Your account is ready. Choose your courses once registration opens.",
        })
        window.location.assign("/dashboard")
      } else {
        window.location.assign(
          `/register/courses?session=${encodeURIComponent(sessions[0].name)}&level_id=${encodeURIComponent(values.levelId)}`
        )
      }
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      if (!navigating) setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-8 w-full max-w-md shadow-sm my-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">YCT Exam Portal</h1>
        <p className="text-sm text-muted-foreground mt-1">Create your student account</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Full Name */}
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full Name</Label>
          <Input
            id="fullName"
            type="text"
            placeholder="Adebayo Olusola"
            autoComplete="name"
            aria-invalid={!!errors.fullName}
            {...register("fullName")}
          />
          <FieldError message={errors.fullName?.message} />
        </div>

        {/* Matric Number */}
        <div className="space-y-1.5">
          <Label htmlFor="matricNumber">Matric Number</Label>
          <Input
            id="matricNumber"
            type="text"
            placeholder="F/ND/24/3210001"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={!!errors.matricNumber}
            aria-describedby="matricNumber-hint"
            {...register("matricNumber")}
          />
          <p
            id="matricNumber-hint"
            className={errors.matricNumber ? "text-sm text-destructive mt-1" : "text-xs text-muted-foreground mt-1"}
          >
            {errors.matricNumber?.message ?? MATRIC_FORMAT_HINT}
          </p>
        </div>

        {/* Email */}
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
          <FieldError message={errors.email?.message} />
        </div>

        {/* Department */}
        <div className="space-y-1.5">
          <Label htmlFor="departmentId">Department</Label>
          <Controller
            name="departmentId"
            control={control}
            render={({ field }) => {
              const selected = departments.find((d) => d.id === field.value)
              return (
                <Select
                  value={field.value || null}
                  onValueChange={(v) => {
                    if (v == null) return
                    field.onChange(v)
                    setValue("programmeId", "")
                    setValue("levelId", "")
                  }}
                  disabled={departmentsQuery.isPending}
                >
                  <SelectTrigger
                    id="departmentId"
                    className="w-full h-9"
                    aria-invalid={!!errors.departmentId}
                  >
                    <SelectValue
                      placeholder={departmentsQuery.isPending ? "Loading…" : "Select your department"}
                    >
                      {selected ? departmentLabel(selected) : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {departmentLabel(d)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            }}
          />
          {departmentsQuery.isError ? (
            <LoadError what="departments" onRetry={() => departmentsQuery.refetch()} />
          ) : (
            <FieldError message={errors.departmentId?.message} />
          )}
        </div>

        {/* Programme */}
        <div className="space-y-1.5">
          <Label htmlFor="programmeId">Programme</Label>
          <Controller
            name="programmeId"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value || null}
                onValueChange={(v) => {
                  if (v == null) return
                  field.onChange(v)
                  setValue("levelId", "")
                }}
                disabled={!departmentId || programmesQuery.isPending}
              >
                <SelectTrigger
                  id="programmeId"
                  className="w-full h-9"
                  aria-invalid={!!errors.programmeId}
                >
                  <SelectValue
                    placeholder={
                      !departmentId
                        ? "Select a department first"
                        : programmesQuery.isPending
                        ? "Loading…"
                        : "Select a programme"
                    }
                  >
                    {programmes.find((p) => p.id === field.value)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {programmes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {programmesQuery.isError ? (
            <LoadError what="programmes" onRetry={() => programmesQuery.refetch()} />
          ) : (
            <FieldError message={errors.programmeId?.message} />
          )}
        </div>

        {/* Level */}
        <div className="space-y-1.5">
          <Label htmlFor="levelId">Level</Label>
          <Controller
            name="levelId"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value || null}
                onValueChange={(v) => {
                  if (v != null) field.onChange(v)
                }}
                disabled={!programmeId || levelsQuery.isPending}
              >
                <SelectTrigger
                  id="levelId"
                  className="w-full h-9"
                  aria-invalid={!!errors.levelId}
                >
                  <SelectValue
                    placeholder={
                      !programmeId
                        ? "Select a programme first"
                        : levelsQuery.isPending
                        ? "Loading…"
                        : "Select a level"
                    }
                  >
                    {levels.find((l) => l.id === field.value)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {levels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {levelsQuery.isError ? (
            <LoadError what="levels" onRetry={() => levelsQuery.refetch()} />
          ) : (
            <FieldError message={errors.levelId?.message} />
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              autoComplete="new-password"
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
          <FieldError message={errors.password?.message} />
        </div>

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="••••••••"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              className="pr-10"
              {...register("confirmPassword")}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <FieldError message={errors.confirmPassword?.message} />
        </div>

        <Button type="submit" className="w-full mt-2" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creating account…
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground mt-6 text-center">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-foreground/80 underline underline-offset-4 hover:text-foreground"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
