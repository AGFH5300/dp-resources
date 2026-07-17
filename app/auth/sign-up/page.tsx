"use client"

import { AlertCircle, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AuthShell } from '@/components/auth-shell'
import { isValidEmail } from '@/lib/auth-email'
import { Spinnebr } from '@/components/ui/spinner'
import { safeInternalReturnPath } from '@/lib/auth-redirect'

type AvailabilityResponse = {
  status?: 'idle' | 'checking' | 'available' | 'invalid' | 'unavailable' | 'error'
  available?: boolean
  reason?: string
  message?: string
}

type FieldStatus = 'untouched' | 'typing' | 'validating' | 'valid' | 'invalid'

type FieldState = {
  touched: boolean
  dirty: boolean
  blurred: boolean
  status: FieldStatus
  error: string | null
  lastValidatedValue: string
  lastValidatedAt: number | null
}

type AvailabilityErrorKind = 'local' | 'unavailable' | 'server'

type AvailabilityFieldState = FieldState & {
  isChecking: boolean
  isAvailable: boolean | null
  errorKind: AvailabilityErrorKind | null
}

const SIGNUP_DRAFT_KEY = 'dp_resource_signup_profile'
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/
const USERNAME_EDGE_UNDERSCORE_PATTERN = /^_|_$/
const USERNAME_REPEATED_UNDERSCORE_PATTERN = /__/
const VALIDATION_DEBOUNCE_MS = 600
const AVAILABILITY_CACHE_VERSION = 'username-status-v2'
const AVAILABILITY_CACHE_SUCCESS_TTL_MS = 20 * 1000
const AVAILABILITY_CACHE_ERROR_TTL_MS = 8 * 1000
const DEFAULT_NEXT_PATH = '/library'

type CachedAvailabilityResult = {
  status: 'available' | 'invalid' | 'unavailable' | 'error'
  message: string
  available: boolean
  checkedAt: number
  value: string
}

function fieldStatusClass({
  status,
  isChecking,
  isAvailable,
  showInvalid = true,
}: {
  status: FieldStatus
  isChecking?: boolean
  isAvailable?: boolean | null
  showInvalid?: boolean
}) {
  if (isChecking || status === 'validating') return ''
  if (status === 'valid' && isAvailable !== false) return 'border-b-[#0c7a43]'
  if (status === 'invalid' && showInvalid) return 'border-b-red-600'
  return ''
}

const INITIAL_FIELD_STATE: FieldState = {
  touched: false,
  dirty: false,
  blurred: false,
  status: 'untouched',
  error: null,
  lastValidatedValue: '',
  lastValidatedAt: null,
}

const INITIAL_AVAILABILITY_FIELD_STATE: AvailabilityFieldState = {
  ...INITIAL_FIELD_STATE,
  isChecking: false,
  isAvailable: null,
  errorKind: null,
}

export default function SignUpPage() {
  const router = useRouter()
  const [observedValues, setObservedValues] = useState({
    usernameRaw: '',
    fullNameRaw: '',
    emailRaw: '',
    username: '',
    fullName: '',
    email: '',
  })
  const [nextPath, setNextPath] = useState(DEFAULT_NEXT_PATH)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [usernameField, setUsernameField] = useState<AvailabilityFieldState>(INITIAL_AVAILABILITY_FIELD_STATE)
  const [fullNameField, setFullNameField] = useState<FieldState>(INITIAL_FIELD_STATE)
  const [emailField, setEmailField] = useState<AvailabilityFieldState>(INITIAL_AVAILABILITY_FIELD_STATE)

  const usernameRequestId = useRef(0)
  const emailRequestId = useRef(0)
  const availabilityCacheRef = useRef<Map<string, CachedAvailabilityResult>>(new Map())
  const usernameRef = useRef<HTMLInputElement>(null)
  const fullNameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const nextPathRef = useRef(DEFAULT_NEXT_PATH)

  const normalizedUsername = observedValues.username
  const normalizedEmail = observedValues.email

  const getCachedAvailabilityResult = useCallback((cacheKey: string) => {
    const cached = availabilityCacheRef.current.get(cacheKey)
    if (!cached) return null
    const ttl = cached.status === 'error' ? AVAILABILITY_CACHE_ERROR_TTL_MS : AVAILABILITY_CACHE_SUCCESS_TTL_MS
    if (Date.now() - cached.checkedAt > ttl) {
      availabilityCacheRef.current.delete(cacheKey)
      return null
    }
    return cached
  }, [])

  const setCachedAvailabilityResult = useCallback((cacheKey: string, result: CachedAvailabilityResult) => {
    availabilityCacheRef.current.set(cacheKey, result)
  }, [])

  const syncFromDom = useCallback(() => {
    const usernameRaw = usernameRef.current?.value ?? ''
    const fullNameRaw = fullNameRef.current?.value ?? ''
    const emailRaw = emailRef.current?.value ?? ''
    const nextValues = {
      usernameRaw,
      fullNameRaw,
      emailRaw,
      username: usernameRaw.trim(),
      fullName: fullNameRaw.trim(),
      email: emailRaw.trim().toLowerCase(),
    }

    setObservedValues((previous) => {
      if (
        previous.usernameRaw === nextValues.usernameRaw &&
        previous.fullNameRaw === nextValues.fullNameRaw &&
        previous.emailRaw === nextValues.emailRaw
      ) {
        return previous
      }
      return nextValues
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const params = new URLSearchParams(window.location.search)
    const safeNext = safeInternalReturnPath(params.get('next'), DEFAULT_NEXT_PATH)
    nextPathRef.current = safeNext
    setNextPath(safeNext)

    const shouldRestoreDraft = params.get('restoreDraft') === '1'
    const hasExplicitQueryValues = params.has('username') || params.has('fullName') || params.has('email')
    const initialUsername = params.get('username') ?? ''
    const initialFullName = params.get('fullName') ?? ''
    const initialEmail = params.get('email') ?? ''

    if (!shouldRestoreDraft && !hasExplicitQueryValues) {
      window.sessionStorage.removeItem(SIGNUP_DRAFT_KEY)
    }

    let cached: { username?: string; fullName?: string; email?: string } | null = null
    if (shouldRestoreDraft) {
      const cachedRaw = window.sessionStorage.getItem(SIGNUP_DRAFT_KEY)
      if (cachedRaw) {
        try {
          cached = JSON.parse(cachedRaw)
        } catch {
          cached = null
        }
      }
    }

    const hydratedValues = {
      username: initialUsername || cached?.username || '',
      fullName: initialFullName || cached?.fullName || '',
      email: initialEmail || cached?.email || '',
    }

    if (usernameRef.current) usernameRef.current.value = hydratedValues.username
    if (fullNameRef.current) fullNameRef.current.value = hydratedValues.fullName
    if (emailRef.current) emailRef.current.value = hydratedValues.email

    syncFromDom()
  }, [syncFromDom])

  const validateFullNameField = useCallback((value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      setFullNameField((previous) => ({
        ...previous,
        status: 'invalid',
        error: 'Enter your full name.',
        lastValidatedValue: trimmed,
      }))
      return false
    }

    setFullNameField((previous) => ({
      ...previous,
      status: 'valid',
      error: null,
      lastValidatedValue: trimmed,
    }))
    return true
  }, [])

  const validateUsernameField = useCallback(async (value: string, trigger: 'blur' | 'debounce' | 'submit' | 'restore') => {
    const trimmed = value.trim()
    const checkedAt = Date.now()

    if (!trimmed) {
      setUsernameField((previous) => ({
        ...previous,
        status: 'invalid',
        error: 'Enter a username.',
        isChecking: false,
        isAvailable: null,
        errorKind: 'local',
        lastValidatedValue: trimmed,
        lastValidatedAt: checkedAt,
      }))
      return false
    }

    if (!USERNAME_PATTERN.test(trimmed) || USERNAME_EDGE_UNDERSCORE_PATTERN.test(trimmed) || USERNAME_REPEATED_UNDERSCORE_PATTERN.test(trimmed)) {
      setUsernameField((previous) => ({
        ...previous,
        status: 'invalid',
        error: 'Use 3-24 characters: letters, numbers, or underscore.',
        isChecking: false,
        isAvailable: null,
        errorKind: 'local',
        lastValidatedValue: trimmed,
        lastValidatedAt: checkedAt,
      }))
      return false
    }

    if (trigger !== 'submit' && trimmed === usernameField.lastValidatedValue && usernameField.lastValidatedAt) {
      return usernameField.status === 'valid'
    }

    const cacheKey = `${AVAILABILITY_CACHE_VERSION}:username:${trimmed}`
    const cached = trigger === 'submit' ? null : getCachedAvailabilityResult(cacheKey)
    if (cached) {
      const isValid = cached.status === 'available' && cached.available
      setUsernameField((previous) => ({
        ...previous,
        status: isValid ? 'valid' : 'invalid',
        error: isValid ? null : cached.message,
        isChecking: false,
        isAvailable: cached.available,
        errorKind: isValid ? null : cached.status === 'unavailable' ? 'unavailable' : cached.status === 'error' ? 'server' : 'local',
        lastValidatedValue: trimmed,
        lastValidatedAt: cached.checkedAt,
      }))
      return isValid
    }

    usernameRequestId.current += 1
    const currentRequestId = usernameRequestId.current
    setUsernameField((previous) => ({
      ...previous,
      status: 'validating',
      error: null,
      isChecking: true,
      isAvailable: null,
      errorKind: null,
    }))

    const requestPath = `/api/auth/availability?type=username&value=${encodeURIComponent(trimmed)}`

    try {
      const response = await fetch(requestPath, { cache: 'no-store' })
      const payload = (await response.json()) as AvailabilityResponse
      const reason = payload.reason ?? payload.message ?? 'Could not validate username right now.'

      if (currentRequestId !== usernameRequestId.current) {
        return false
      }

      if (!response.ok) {
        setCachedAvailabilityResult(cacheKey, {
          status: payload.status === 'invalid' ? 'invalid' : 'error',
          message: reason,
          available: false,
          checkedAt: Date.now(),
          value: trimmed,
        })
        setUsernameField((previous) => ({
          ...previous,
          status: 'invalid',
          error: reason,
          isChecking: false,
          isAvailable: false,
          errorKind: payload.status === 'invalid' ? 'local' : 'server',
          lastValidatedValue: trimmed,
          lastValidatedAt: Date.now(),
        }))
        return false
      }

      if (payload.status === 'invalid') {
        setCachedAvailabilityResult(cacheKey, {
          status: 'invalid',
          message: reason,
          available: false,
          checkedAt: Date.now(),
          value: trimmed,
        })
        setUsernameField((previous) => ({
          ...previous,
          status: 'invalid',
          error: reason,
          isChecking: false,
          isAvailable: false,
          errorKind: payload.status === 'invalid' ? 'local' : 'server',
          lastValidatedValue: trimmed,
          lastValidatedAt: Date.now(),
        }))
        return false
      }

      if (!payload.available) {
        const unavailableMessage = reason || 'That username is already taken.'
        setCachedAvailabilityResult(cacheKey, {
          status: 'unavailable',
          message: unavailableMessage,
          available: false,
          checkedAt: Date.now(),
          value: trimmed,
        })
        setUsernameField((previous) => ({
          ...previous,
          status: 'invalid',
          error: unavailableMessage,
          isChecking: false,
          isAvailable: false,
          errorKind: 'unavailable',
          lastValidatedValue: trimmed,
          lastValidatedAt: Date.now(),
        }))
        return false
      }

      setCachedAvailabilityResult(cacheKey, {
        status: 'available',
        message: '',
        available: true,
        checkedAt: Date.now(),
        value: trimmed,
      })
      setUsernameField((previous) => ({
        ...previous,
        status: 'valid',
        error: null,
        isChecking: false,
        isAvailable: true,
        errorKind: null,
        lastValidatedValue: trimmed,
        lastValidatedAt: Date.now(),
      }))
      return true
    } catch {
      if (currentRequestId !== usernameRequestId.current) {
        return false
      }

      const genericError = 'Could not validate username right now.'
      setCachedAvailabilityResult(cacheKey, {
        status: 'error',
        message: genericError,
        available: false,
        checkedAt: Date.now(),
        value: trimmed,
      })
      setUsernameField((previous) => ({
        ...previous,
        status: 'invalid',
        error: genericError,
        isChecking: false,
        isAvailable: false,
        errorKind: 'server',
        lastValidatedValue: trimmed,
        lastValidatedAt: Date.now(),
      }))
      return false
    }
  }, [getCachedAvailabilityResult, setCachedAvailabilityResult, usernameField.lastValidatedAt, usernameField.lastValidatedValue, usernameField.status])

  const validateEmailField = useCallback(async (value: string, trigger: 'blur' | 'debounce' | 'submit' | 'restore') => {
    const trimmed = value.trim().toLowerCase()
    const checkedAt = Date.now()

    if (!trimmed) {
      setEmailField((previous) => ({
        ...previous,
        status: 'invalid',
        error: 'Enter your email address.',
        isChecking: false,
        isAvailable: null,
        errorKind: 'local',
        lastValidatedValue: trimmed,
        lastValidatedAt: checkedAt,
      }))
      return false
    }

    if (!isValidEmail(trimmed)) {
      setEmailField((previous) => ({
        ...previous,
        status: 'invalid',
        error: 'Enter a valid email address.',
        isChecking: false,
        isAvailable: null,
        errorKind: 'local',
        lastValidatedValue: trimmed,
        lastValidatedAt: checkedAt,
      }))
      return false
    }

    if (trigger !== 'submit' && trimmed === emailField.lastValidatedValue && emailField.lastValidatedAt) {
      return emailField.status === 'valid'
    }

    const cacheKey = `${AVAILABILITY_CACHE_VERSION}:email:${trimmed}`
    const cached = trigger === 'submit' ? null : getCachedAvailabilityResult(cacheKey)
    if (cached) {
      const isValid = cached.status === 'available' && cached.available
      setEmailField((previous) => ({
        ...previous,
        status: isValid ? 'valid' : 'invalid',
        error: isValid ? null : cached.message,
        isChecking: false,
        isAvailable: cached.available,
        errorKind: isValid ? null : cached.status === 'unavailable' ? 'unavailable' : cached.status === 'error' ? 'server' : 'local',
        lastValidatedValue: trimmed,
        lastValidatedAt: cached.checkedAt,
      }))
      return isValid
    }

    emailRequestId.current += 1
    const currentRequestId = emailRequestId.current
    setEmailField((previous) => ({
      ...previous,
      status: 'validating',
      error: null,
      isChecking: true,
      isAvailable: null,
      errorKind: null,
    }))

    const requestPath = `/api/auth/availability?type=email&value=${encodeURIComponent(trimmed)}`

    try {
      const response = await fetch(requestPath, { cache: 'no-store' })
      const payload = (await response.json()) as AvailabilityResponse
      const reason = payload.reason ?? payload.message ?? 'Could not validate email right now.'

      if (currentRequestId !== emailRequestId.current) {
        return false
      }

      if (!response.ok) {
        setCachedAvailabilityResult(cacheKey, {
          status: payload.status === 'invalid' ? 'invalid' : 'error',
          message: reason,
          available: false,
          checkedAt: Date.now(),
          value: trimmed,
        })
        setEmailField((previous) => ({
          ...previous,
          status: 'invalid',
          error: reason,
          isChecking: false,
          isAvailable: false,
          errorKind: payload.status === 'invalid' ? 'local' : 'server',
          lastValidatedValue: trimmed,
          lastValidatedAt: Date.now(),
        }))
        return false
      }

      if (payload.status === 'invalid') {
        setCachedAvailabilityResult(cacheKey, {
          status: 'invalid',
          message: reason,
          available: false,
          checkedAt: Date.now(),
          value: trimmed,
        })
        setEmailField((previous) => ({
          ...previous,
          status: 'invalid',
          error: reason,
          isChecking: false,
          isAvailable: false,
          errorKind: 'local',
          lastValidatedValue: trimmed,
          lastValidatedAt: Date.now(),
        }))
        return false
      }

      if (!payload.available) {
        const unavailableMessage = reason || 'That email is already registered.'
        setCachedAvailabilityResult(cacheKey, {
          status: 'unavailable',
          message: unavailableMessage,
          available: false,
          checkedAt: Date.now(),
          value: trimmed,
        })
        setEmailField((previous) => ({
          ...previous,
          status: 'invalid',
          error: unavailableMessage,
          isChecking: false,
          isAvailable: false,
          errorKind: 'unavailable',
          lastValidatedValue: trimmed,
          lastValidatedAt: Date.now(),
        }))
        return false
      }

      setCachedAvailabilityResult(cacheKey, {
        status: 'available',
        message: '',
        available: true,
        checkedAt: Date.now(),
        value: trimmed,
      })
      setEmailField((previous) => ({
        ...previous,
        status: 'valid',
        error: null,
        isChecking: false,
        isAvailable: true,
        errorKind: null,
        lastValidatedValue: trimmed,
        lastValidatedAt: Date.now(),
      }))
      return true
    } catch {
      if (currentRequestId !== emailRequestId.current) {
        return false
      }

      const genericError = 'Could not validate email right now.'
      setCachedAvailabilityResult(cacheKey, {
        status: 'error',
        message: genericError,
        available: false,
        checkedAt: Date.now(),
        value: trimmed,
      })
      setEmailField((previous) => ({
        ...previous,
        status: 'invalid',
        error: genericError,
        isChecking: false,
        isAvailable: false,
        errorKind: 'server',
        lastValidatedValue: trimmed,
        lastValidatedAt: Date.now(),
      }))
      return false
    }
  }, [emailField.lastValidatedAt, emailField.lastValidatedValue, emailField.status, getCachedAvailabilityResult, setCachedAvailabilityResult])

  useEffect(() => {
    if (usernameField.status !== 'typing') return

    const timeoutId = window.setTimeout(() => {
      void validateUsernameField(observedValues.username, 'debounce')
    }, VALIDATION_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [observedValues.username, usernameField.status, validateUsernameField])

  useEffect(() => {
    if (fullNameField.status !== 'typing') return

    const timeoutId = window.setTimeout(() => {
      validateFullNameField(observedValues.fullName)
    }, VALIDATION_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [fullNameField.status, observedValues.fullName, validateFullNameField])

  useEffect(() => {
    if (emailField.status !== 'typing') return

    const timeoutId = window.setTimeout(() => {
      void validateEmailField(observedValues.email, 'debounce')
    }, VALIDATION_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [emailField.status, observedValues.email, validateEmailField])

  useEffect(() => {
    if (!normalizedUsername || usernameField.status !== 'untouched') return
    void validateUsernameField(normalizedUsername, 'restore')
  }, [normalizedUsername, usernameField.status, validateUsernameField])

  useEffect(() => {
    if (!normalizedEmail || emailField.status !== 'untouched') return
    void validateEmailField(normalizedEmail, 'restore')
  }, [emailField.status, normalizedEmail, validateEmailField])

  const onUsernameInput = useCallback(() => {
    syncFromDom()
    usernameRequestId.current += 1
    setUsernameField((previous) => ({
      ...previous,
      touched: true,
      dirty: true,
      status: 'typing',
      error: null,
      isChecking: false,
      isAvailable: null,
      errorKind: null,
    }))
  }, [syncFromDom])

  const onFullNameInput = useCallback(() => {
    syncFromDom()
    setFullNameField((previous) => ({
      ...previous,
      touched: true,
      dirty: true,
      status: 'typing',
      error: null,
    }))
  }, [syncFromDom])

  const onEmailInput = useCallback(() => {
    syncFromDom()
    emailRequestId.current += 1
    setEmailField((previous) => ({
      ...previous,
      touched: true,
      dirty: true,
      status: 'typing',
      error: null,
      isChecking: false,
      isAvailable: null,
      errorKind: null,
    }))
  }, [syncFromDom])

  const canSubmit = useMemo(() => {
    return (
      !isSubmitting &&
      usernameField.status === 'valid' &&
      fullNameField.status === 'valid' &&
      emailField.status === 'valid' &&
      !usernameField.isChecking &&
      !emailField.isChecking
    )
  }, [emailField.isChecking, emailField.status, fullNameField.status, isSubmitting, usernameField.isChecking, usernameField.status])

  const shouldShowUsernameError = Boolean(
    usernameField.status === 'invalid' &&
      usernameField.error &&
      (submitAttempted || usernameField.blurred || usernameField.errorKind === 'unavailable' || usernameField.errorKind === 'server'),
  )
  const shouldShowFullNameError = fullNameField.status === 'invalid' && fullNameField.error && (submitAttempted || fullNameField.blurred)
  const shouldShowEmailError = Boolean(
    emailField.status === 'invalid' &&
      emailField.error &&
      (submitAttempted || emailField.blurred || emailField.errorKind === 'unavailable' || emailField.errorKind === 'server'),
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSubmitting) return
    setSubmitAttempted(true)
    setError(null)

    setUsernameField((previous) => ({ ...previous, touched: true, blurred: true }))
    setFullNameField((previous) => ({ ...previous, touched: true, blurred: true }))
    setEmailField((previous) => ({ ...previous, touched: true, blurred: true }))

    const [isUsernameValid, isEmailValid] = await Promise.all([
      validateUsernameField(observedValues.username, 'submit'),
      validateEmailField(observedValues.email, 'submit'),
    ])
    const isFullNameValid = validateFullNameField(observedValues.fullName)

    if (!isUsernameValid || !isFullNameValid || !isEmailValid) {
      return
    }

    setIsSubmitting(true)

    try {
      const payload = {
        username: observedValues.username,
        fullName: observedValues.fullName,
        email: observedValues.email,
      }

      const response = await fetch('/api/auth/start-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          ...payload,
          next: nextPathRef.current,
        }),
      })
      const result = (await response.json()) as { ok?: boolean; message?: string; field?: 'username' | 'email' | 'fullName' | 'form' }

      if (!response.ok || !result.ok) {
        const message = result.message || 'Something went wrong while creating your account. Please try again.'
        if (result.field === 'username') {
          setUsernameField((previous) => ({ ...previous, status: 'invalid', error: message, isChecking: false, isAvailable: false, errorKind: 'unavailable' }))
        } else if (result.field === 'email') {
          setEmailField((previous) => ({ ...previous, status: 'invalid', error: message, isChecking: false, isAvailable: false, errorKind: 'unavailable' }))
        } else if (result.field === 'fullName') {
          setFullNameField((previous) => ({ ...previous, status: 'invalid', error: message }))
        }
        setError(message)
        return
      }

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(payload))
      }

      const query = new URLSearchParams({
        email: payload.email,
        username: payload.username,
        fullName: payload.fullName,
        mode: 'signup',
        next: nextPathRef.current,
      })

      router.push(`/auth/verify-otp?${query.toString()}`)
    } catch {
      setError('Something went wrong while creating your account. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Create account"
      title="Set up your free account in a few steps."
      description="Enter your details, verify your email, then continue to a massive resource library."
      quote="The goal of education is not to increase the amount of knowledge but to create the possibilities for a child to invent and discover."
      attribution="Jean Piaget"
    >
      <h1 className="font-headline text-4xl text-[#00152a]">Create account</h1>
      <p className="mt-3 font-body text-[#43474d]">Create your account to access the library.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate autoComplete="off">
        <input type="text" name="fake_username" autoComplete="username" className="hidden" tabIndex={-1} aria-label="Autofill username placeholder" />
        <input type="password" name="fake_password" autoComplete="new-password" className="hidden" tabIndex={-1} aria-label="Autofill password placeholder" />

        <div>
          <label htmlFor="signup-username" className="font-label text-xs uppercase tracking-widest text-[#43474d]">Username</label>
          <div className="relative">
            <input
              ref={usernameRef}
              id="signup-username"
              className={`tsm-input pr-10 ${fieldStatusClass({ ...usernameField, showInvalid: shouldShowUsernameError })}`}
              type="text"
              name="signup_username_input"
              onChange={onUsernameInput}
              onInput={onUsernameInput}
              onBlur={() => {
                syncFromDom()
                setUsernameField((previous) => ({ ...previous, touched: true, blurred: true }))
                void validateUsernameField(usernameRef.current?.value ?? '', 'blur')
              }}
              required
              disabled={isSubmitting}
              autoComplete="off"
            />
            <div className="pointer-events-none absolute right-2 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center">
              {(usernameField.isChecking || usernameField.status === 'validating') && <Spinner className="size-4 text-[#00152a]" />}
              {usernameField.status === 'valid' && usernameField.isAvailable && <CheckCircle2 className="size-4 text-[#0c7a43]" />}
              {shouldShowUsernameError && <AlertCircle className="size-4 text-red-600" />}
            </div>
          </div>
          {shouldShowUsernameError ? <p className="mt-2 text-sm text-red-700">{usernameField.error}</p> : null}
        </div>

        <div>
          <label htmlFor="signup-full-name" className="font-label text-xs uppercase tracking-widest text-[#43474d]">Full name</label>
          <input
            ref={fullNameRef}
            id="signup-full-name"
            className={`tsm-input ${fieldStatusClass({ status: fullNameField.status })}`}
            type="text"
            name="signup_full_name_input"
            onChange={onFullNameInput}
            onInput={onFullNameInput}
            onBlur={() => {
              syncFromDom()
              setFullNameField((previous) => ({ ...previous, touched: true, blurred: true }))
              validateFullNameField(fullNameRef.current?.value ?? '')
            }}
            required
            disabled={isSubmitting}
            autoComplete="off"
          />
          {shouldShowFullNameError ? <p className="mt-2 text-sm text-red-700">{fullNameField.error}</p> : null}
        </div>

        <div>
          <label htmlFor="signup-email" className="font-label text-xs uppercase tracking-widest text-[#43474d]">Email</label>
          <div className="relative">
            <input
              ref={emailRef}
              id="signup-email"
              className={`tsm-input pr-10 ${fieldStatusClass({ ...emailField, showInvalid: shouldShowEmailError })}`}
              type="email"
              name="signup_email_input"
              onChange={onEmailInput}
              onInput={onEmailInput}
              onBlur={() => {
                syncFromDom()
                setEmailField((previous) => ({ ...previous, touched: true, blurred: true }))
                void validateEmailField(emailRef.current?.value ?? '', 'blur')
              }}
              required
              disabled={isSubmitting}
              autoComplete="off"
            />
            <div className="pointer-events-none absolute right-2 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center">
              {(emailField.isChecking || emailField.status === 'validating') && <Spinner className="size-4 text-[#00152a]" />}
              {emailField.status === 'valid' && emailField.isAvailable && <CheckCircle2 className="size-4 text-[#0c7a43]" />}
              {shouldShowEmailError && <AlertCircle className="size-4 text-red-600" />}
            </div>
          </div>
          {shouldShowEmailError ? <p className="mt-2 text-sm text-red-700">{emailField.error}</p> : null}
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-[#00152a] py-4 text-white transition-colors hover:bg-[#08284a] focus:outline-none focus:ring-2 focus:ring-[#00152a]/30 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={!canSubmit}
        >
          {isSubmitting ? (
            <>
              <Spinner className="size-4" />
              <span>Creating your account...</span>
            </>
          ) : (
            'Create account'
          )}
        </button>
      </form>

      <p className="mt-8 border-t border-[#c3c6ce55] pt-6 text-center font-body text-sm text-[#43474d]">
        Already have an account?
        <Link
          href={`/auth/login${nextPath !== '/library' ? `?next=${encodeURIComponent(nextPath)}` : ''}`}
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.sessionStorage.removeItem(SIGNUP_DRAFT_KEY)
            }
          }}
          className="ml-1 font-semibold text-[#735b2b]"
        >
          Log In
        </Link>
      </p>
    </AuthShell>
  )
}
