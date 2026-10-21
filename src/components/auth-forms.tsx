"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/feedback";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { Panel } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { ADMIN_PREFIX } from "@/lib/domain/identity";
import { PASSWORD_MIN } from "@/lib/domain/schemas";
import { api, ApiError } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";

type Errors = { form?: string; [field: string]: string | undefined };

/** Turns an API error into a form-level message plus per-field messages. */
function toErrors(e: unknown): Errors {
  if (!(e instanceof ApiError)) return { form: "Something went wrong. Try again." };
  return { form: e.message, ...Object.fromEntries(e.fields.map((f) => [f.path, f.message])) };
}

const homeFor = (role: string) => (role === "admin" ? "/admin" : "/");

/** Redirects away from login/activate once a session exists. */
function useRedirectWhenSignedIn() {
  const { state } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (state.status === "signedIn") router.replace(homeFor(state.me.role));
  }, [state, router]);
}

export function LoginForm({ admin = false }: { admin?: boolean }) {
  useRedirectWhenSignedIn();
  const { signInWithToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const id = String(f.get("loginId"));
    setBusy(true);
    setErrors({});
    try {
      const { token } = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: { loginId: admin ? ADMIN_PREFIX + id : id, password: f.get("password") },
      });
      await signInWithToken(token); // redirect happens via useRedirectWhenSignedIn
    } catch (err) {
      setErrors(toErrors(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{admin ? "Admin sign in" : "Sign in"}</h1>
      <Panel as="div" className="p-5">
        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          {errors.form && <Banner tone="danger" title={errors.form} />}
          <Field label={admin ? "Admin ID" : "Roll number"} required>
            <Input name="loginId" autoComplete="username" autoCapitalize="none" maxLength={64} />
          </Field>
          <Field label="Password" required>
            <PasswordInput name="password" autoComplete="current-password" maxLength={128} />
          </Field>
          <Button type="submit" loading={busy}>
            Sign in
          </Button>
        </form>
      </Panel>
      {admin ? (
        <p className="text-sm text-muted">
          Admin accounts are created by the project owner. Students sign in at{" "}
          <Link href="/login" className="text-ink underline underline-offset-2">
            the student sign-in page
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-2 text-sm text-muted">
          <p>
            First time here?{" "}
            <Link href="/activate" className="font-semibold text-ink underline underline-offset-2">
              Activate your account
            </Link>{" "}
            with the code from your hostel admin.
          </p>
          <p>Forgot your password? Ask your hostel admin for a new activation code.</p>
        </div>
      )}
    </div>
  );
}

export function ActivateForm() {
  useRedirectWhenSignedIn();
  const { signInWithToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm"))
      return setErrors({ confirm: "The two passwords don't match." });
    setBusy(true);
    setErrors({});
    try {
      const { token } = await api<{ token: string }>("/api/auth/activate", {
        method: "POST",
        body: { rollNumber: f.get("rollNumber"), code: f.get("code"), password: f.get("password") },
      });
      await signInWithToken(token);
    } catch (err) {
      setErrors(toErrors(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Activate your account</h1>
        <p className="text-muted">
          Use the one-time code your hostel admin gave you, then choose a password. Also use this
          page if the admin reset your password.
        </p>
      </div>
      <Panel as="div" className="p-5">
        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          {errors.form && <Banner tone="danger" title={errors.form} />}
          <Field label="Roll number" required>
            <Input name="rollNumber" autoComplete="username" autoCapitalize="none" maxLength={64} />
          </Field>
          <Field label="Activation code" required hint="10 letters and numbers, like K7MQ2-XR9PD">
            <Input
              name="code"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={32}
            />
          </Field>
          <Field
            label="New password"
            required
            hint={`At least ${PASSWORD_MIN} characters. Don't include your roll number.`}
            error={errors.password}
          >
            <PasswordInput name="password" autoComplete="new-password" maxLength={128} />
          </Field>
          <Field label="Repeat new password" required error={errors.confirm}>
            <PasswordInput name="confirm" autoComplete="new-password" maxLength={128} />
          </Field>
          <Button type="submit" loading={busy}>
            Activate account
          </Button>
        </form>
      </Panel>
      <p className="text-sm text-muted">
        Already activated?{" "}
        <Link href="/login" className="font-semibold text-ink underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export function ChangePasswordForm() {
  const { signInWithToken } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get("newPassword") !== f.get("confirm"))
      return setErrors({ confirm: "The two passwords don't match." });
    setBusy(true);
    setErrors({});
    try {
      const { token } = await api<{ token: string }>("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword: f.get("currentPassword"), newPassword: f.get("newPassword") },
      });
      await signInWithToken(token); // other sessions were signed out; keep this one
      form.reset();
      toast({ title: "Password changed", body: "You've been signed out on other devices." });
    } catch (err) {
      setErrors(toErrors(err));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 p-4" noValidate>
      {errors.form && <Banner tone="danger" title={errors.form} />}
      <Field label="Current password" required>
        <PasswordInput name="currentPassword" autoComplete="current-password" maxLength={128} />
      </Field>
      <Field
        label="New password"
        required
        hint={`At least ${PASSWORD_MIN} characters.`}
        error={errors.newPassword}
      >
        <PasswordInput name="newPassword" autoComplete="new-password" maxLength={128} />
      </Field>
      <Field label="Repeat new password" required error={errors.confirm}>
        <PasswordInput name="confirm" autoComplete="new-password" maxLength={128} />
      </Field>
      <Button type="submit" variant="secondary" loading={busy} className="self-start">
        Change password
      </Button>
    </form>
  );
}
