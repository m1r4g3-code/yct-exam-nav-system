"use client"

import { useEffect, useState, startTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { DEFAULT_SESSION } from "@/lib/constants"
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

const registerSchema = z
  .object({
    fullName: z.string().min(2, "Full name must be at least 2 characters"),
    matricNumber: z
      .string()
      .min(4, "Matric number must be at least 4 characters"),
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
    programmeId: z.string().min(1, "Select a programme"),
    levelId: z.string().min(1, "Select a level"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

type RegisterFormValues = z.infer<typeof registerSchema>

type Department = { id: string; name: string; code: string }
type Programme = { id: string; name: string }
type Level = { id: string; name: string }
type ApiResponse<T> = {
  success: boolean
  data: T | null
  message: string
  errors?: { field: string; message: string }[]
}

export default function RegisterPage() {
  const router = useRouter()

  const [departments, setDepartments] = useState<Department[]>([])
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [levels, setLevels] = useState<Level[]>([])

  const [selectedDeptId, setSelectedDeptId] = useState<string>("")
  const [loadingDepts, setLoadingDepts] = useState(true)
  const [loadingProgrammes, setLoadingProgrammes] = useState(false)
  const [loadingLevels, setLoadingLevels] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      matricNumber: "",
      email: "",
      password: "",
      confirmPassword: "",
      programmeId: "",
      levelId: "",
    },
  })

  const programmeId = useWatch({ control, name: "programmeId" })

  // Fetch all departments on mount
  useEffect(() => {
    async function fetchDepartments() {
      try {
        const res = await fetch("/api/departments")
        const json: ApiResponse<Department[]> = await res.json()
        if (json.success && json.data) setDepartments(json.data)
      } catch {
        toast.error("Failed to load departments.")
      } finally {
        setLoadingDepts(false)
      }
    }
    fetchDepartments()
  }, [])

  // Fetch programmes when department changes
  useEffect(() => {
    if (!selectedDeptId) {
      startTransition(() => {
        setProgrammes([])
        setValue("programmeId", "")
        setValue("levelId", "")
        setLevels([])
      })
      return
    }

    async function fetchProgrammes() {
      setLoadingProgrammes(true)
      try {
        const res = await fetch(
          `/api/programmes?department_id=${encodeURIComponent(selectedDeptId)}`
        )
        const json: ApiResponse<Programme[]> = await res.json()
        if (json.success && json.data) setProgrammes(json.data)
      } catch {
        toast.error("Failed to load programmes.")
      } finally {
        setLoadingProgrammes(false)
      }
    }
    fetchProgrammes()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeptId])

  // Fetch levels when programmeId changes
  useEffect(() => {
    if (!programmeId) {
      startTransition(() => {
        setLevels([])
        setValue("levelId", "")
      })
      return
    }

    async function fetchLevels() {
      setLoadingLevels(true)
      try {
        const res = await fetch(
          `/api/levels?programme_id=${encodeURIComponent(programmeId)}`
        )
        const json: ApiResponse<Level[]> = await res.json()
        if (json.success && json.data) setLevels(json.data)
      } catch {
        toast.error("Failed to load levels.")
      } finally {
        setLoadingLevels(false)
      }
    }
    fetchLevels()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programmeId])

  async function onSubmit(values: RegisterFormValues) {
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          fullName: values.fullName,
          matricNumber: values.matricNumber,
          programmeId: values.programmeId,
          levelId: values.levelId,
        }),
      })

      const json: ApiResponse<null> = await res.json()

      if (!json.success) {
        toast.error(json.message)
        return
      }

      // Sign in immediately so /api/students/me works on the next page
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      })
      if (signInError) {
        toast.error("Account created but sign-in failed — please log in manually.")
        router.push("/login")
        return
      }

      router.refresh()
      router.push(
        `/register/courses?session=${encodeURIComponent(DEFAULT_SESSION)}&level_id=${encodeURIComponent(values.levelId)}`
      )
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-8 w-full max-w-md shadow-sm">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">YCT Exam Portal</h1>
        <p className="text-sm text-muted-foreground mt-1">Create your student account</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
          {errors.fullName && (
            <p className="text-sm text-destructive mt-1">{errors.fullName.message}</p>
          )}
        </div>

        {/* Matric Number */}
        <div className="space-y-1.5">
          <Label htmlFor="matricNumber">Matric Number</Label>
          <Input
            id="matricNumber"
            type="text"
            placeholder="F/HD/21/3210001"
            autoComplete="off"
            aria-invalid={!!errors.matricNumber}
            {...register("matricNumber")}
          />
          {errors.matricNumber && (
            <p className="text-sm text-destructive mt-1">{errors.matricNumber.message}</p>
          )}
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
          {errors.email && (
            <p className="text-sm text-destructive mt-1">{errors.email.message}</p>
          )}
        </div>

        {/* Department */}
        <div className="space-y-1.5">
          <Label>Department</Label>
          <Select
            value={selectedDeptId}
            onValueChange={(v) => {
              if (v == null) return
              setSelectedDeptId(v)
              setValue("programmeId", "")
              setValue("levelId", "")
            }}
          >
            <SelectTrigger className="w-full h-9">
              <SelectValue
                placeholder={loadingDepts ? "Loading…" : "Select your department"}
              >
                {departments.find((d) => d.id === selectedDeptId)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {loadingDepts ? (
                <SelectItem value="__loading__" disabled>Loading…</SelectItem>
              ) : (
                departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Programme */}
        <div className="space-y-1.5">
          <Label htmlFor="programmeId">Programme</Label>
          <Controller
            name="programmeId"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  if (v == null) return
                  field.onChange(v)
                  setValue("levelId", "")
                }}
                disabled={!selectedDeptId || loadingProgrammes}
              >
                <SelectTrigger
                  id="programmeId"
                  className="w-full h-9"
                  aria-invalid={!!errors.programmeId}
                >
                  <SelectValue
                    placeholder={
                      !selectedDeptId
                        ? "Select a department first"
                        : loadingProgrammes
                        ? "Loading…"
                        : "Select a programme"
                    }
                  >
                    {programmes.find((p) => p.id === field.value)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {loadingProgrammes ? (
                    <SelectItem value="__loading__" disabled>Loading…</SelectItem>
                  ) : (
                    programmes.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          />
          {errors.programmeId && (
            <p className="text-sm text-destructive mt-1">{errors.programmeId.message}</p>
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
                value={field.value}
                onValueChange={field.onChange}
                disabled={!programmeId || loadingLevels}
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
                        : loadingLevels
                        ? "Loading…"
                        : "Select a level"
                    }
                  >
                    {levels.find((l) => l.id === field.value)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {loadingLevels ? (
                    <SelectItem value="__loading__" disabled>Loading…</SelectItem>
                  ) : (
                    levels.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          />
          {errors.levelId && (
            <p className="text-sm text-destructive mt-1">{errors.levelId.message}</p>
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
          {errors.password && (
            <p className="text-sm text-destructive mt-1">{errors.password.message}</p>
          )}
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
          {errors.confirmPassword && (
            <p className="text-sm text-destructive mt-1">{errors.confirmPassword.message}</p>
          )}
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
