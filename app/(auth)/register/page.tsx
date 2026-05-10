"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { DEFAULT_SESSION } from "@/lib/constants"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

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

type Programme = {
  id: string
  name: string
}

type Level = {
  id: string
  name: string
}

type ApiResponse<T> = {
  success: boolean
  data: T | null
  message: string
  errors?: { field: string; message: string }[]
}

export default function RegisterPage() {
  const router = useRouter()

  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [levels, setLevels] = useState<Level[]>([])
  const [loadingProgrammes, setLoadingProgrammes] = useState(true)
  const [loadingLevels, setLoadingLevels] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    watch,
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

  const programmeId = watch("programmeId")

  // Fetch programmes on mount
  useEffect(() => {
    async function fetchProgrammes() {
      try {
        const res = await fetch("/api/programmes")
        const json: ApiResponse<Programme[]> = await res.json()
        if (json.success && json.data) {
          setProgrammes(json.data)
        }
      } catch {
        toast.error("Failed to load programmes.")
      } finally {
        setLoadingProgrammes(false)
      }
    }

    fetchProgrammes()
  }, [])

  // Fetch levels when programmeId changes
  useEffect(() => {
    if (!programmeId) {
      setLevels([])
      return
    }

    async function fetchLevels() {
      setLoadingLevels(true)
      try {
        const res = await fetch(
          `/api/levels?programme_id=${encodeURIComponent(programmeId)}`
        )
        const json: ApiResponse<Level[]> = await res.json()
        if (json.success && json.data) {
          setLevels(json.data)
        }
      } catch {
        toast.error("Failed to load levels.")
      } finally {
        setLoadingLevels(false)
      }
    }

    fetchLevels()
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

      // Refresh the router so the server picks up the new session cookie
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 w-full max-w-md">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-50">YCT Exam Portal</h1>
        <p className="text-sm text-zinc-400 mt-1">Create your student account</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Full Name */}
        <div className="space-y-1.5">
          <Label htmlFor="fullName" className="text-zinc-300">
            Full Name
          </Label>
          <Input
            id="fullName"
            type="text"
            placeholder="Adebayo Olusola"
            autoComplete="name"
            aria-invalid={!!errors.fullName}
            {...register("fullName")}
          />
          {errors.fullName && (
            <p className="text-sm text-red-400 mt-1">
              {errors.fullName.message}
            </p>
          )}
        </div>

        {/* Matric Number */}
        <div className="space-y-1.5">
          <Label htmlFor="matricNumber" className="text-zinc-300">
            Matric Number
          </Label>
          <Input
            id="matricNumber"
            type="text"
            placeholder="F/HD/21/3210001"
            autoComplete="off"
            aria-invalid={!!errors.matricNumber}
            {...register("matricNumber")}
          />
          {errors.matricNumber && (
            <p className="text-sm text-red-400 mt-1">
              {errors.matricNumber.message}
            </p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-zinc-300">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          {errors.email && (
            <p className="text-sm text-red-400 mt-1">{errors.email.message}</p>
          )}
        </div>

        {/* Programme */}
        <div className="space-y-1.5">
          <Label htmlFor="programmeId" className="text-zinc-300">
            Programme
          </Label>
          <Controller
            name="programmeId"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  id="programmeId"
                  className="w-full h-9"
                  aria-invalid={!!errors.programmeId}
                >
                  <SelectValue placeholder="Select a programme">
                    {programmes.find((p) => p.id === field.value)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {loadingProgrammes ? (
                    <SelectItem value="__loading__" disabled>
                      Loading…
                    </SelectItem>
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
            <p className="text-sm text-red-400 mt-1">
              {errors.programmeId.message}
            </p>
          )}
        </div>

        {/* Level */}
        <div className="space-y-1.5">
          <Label htmlFor="levelId" className="text-zinc-300">
            Level
          </Label>
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
                    <SelectItem value="__loading__" disabled>
                      Loading…
                    </SelectItem>
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
            <p className="text-sm text-red-400 mt-1">
              {errors.levelId.message}
            </p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-zinc-300">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          {errors.password && (
            <p className="text-sm text-red-400 mt-1">
              {errors.password.message}
            </p>
          )}
        </div>

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className="text-zinc-300">
            Confirm Password
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            aria-invalid={!!errors.confirmPassword}
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-sm text-red-400 mt-1">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full mt-2"
          disabled={isSubmitting}
        >
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

      <p className="text-sm text-zinc-400 mt-6 text-center">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-zinc-200 underline underline-offset-4 hover:text-zinc-50"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
