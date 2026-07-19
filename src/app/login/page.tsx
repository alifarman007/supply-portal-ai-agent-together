"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Fingerprint,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/shell/Logo";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { LangToggle } from "@/components/shell/LangToggle";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { OtpInput } from "@/components/auth/OtpInput";
import { useAuth } from "@/store/auth";

const EXPECTED_OTP = "135790";
const MAX_ATTEMPTS = 3;
const OTP_DESTINATION = "+880 1•••• ••23";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const credsSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
type Creds = z.infer<typeof credsSchema>;

export default function LoginPage() {
  const router = useRouter();
  const login = useAuth((s) => s.login);

  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const form = useForm<Creds>({
    resolver: zodResolver(credsSchema),
    defaultValues: {
      email: "ahsan.kabir@dhakapackaging.com.bd",
      password: "Demo@2026!",
    },
  });

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const onCreds = form.handleSubmit(async () => {
    setSubmitting(true);
    await wait(750);
    setSubmitting(false);
    setStep("otp");
    setResendIn(30);
  });

  const verify = async (code = otp) => {
    if (locked || verifying) return;
    setVerifying(true);
    await wait(850);
    setVerifying(false);
    if (code === EXPECTED_OTP) {
      login();
      toast.success("Signed in", { description: "Welcome to the Kazi Farms Supplier Portal." });
      router.push("/app");
      return;
    }
    const a = attempts + 1;
    setAttempts(a);
    setOtp("");
    if (a >= MAX_ATTEMPTS) {
      setLocked(true);
      setOtpError(
        "Account temporarily locked after 3 failed attempts. Please contact your administrator.",
      );
    } else {
      const left = MAX_ATTEMPTS - a;
      setOtpError(
        `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} remaining.`,
      );
    }
  };

  const resend = () => {
    if (resendIn > 0 || locked) return;
    setResendIn(30);
    setOtpError(null);
    setOtp("");
    toast.success("A new verification code has been sent.");
  };

  return (
    <div className="relative min-h-dvh overflow-hidden lg:grid lg:grid-cols-2">
      {/* aurora background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <motion.div
          className="absolute top-[-6rem] left-[-5rem] size-[40rem] rounded-full bg-brand-red/25 blur-[150px] dark:bg-brand-red/40"
          animate={{ x: [0, 60, 0], y: [0, 36, 0], scale: [1, 1.12, 1] }}
          transition={{ duration: 19, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-1/4 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-brand-cream/20 blur-[160px] dark:bg-brand-cream/12"
          animate={{ y: [0, 44, 0], scale: [1, 1.18, 1] }}
          transition={{ duration: 23, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-[-5rem] bottom-[-7rem] size-[36rem] rounded-full bg-brand-red/20 blur-[150px] dark:bg-info/22"
          animate={{ x: [0, -46, 0], y: [0, -30, 0], scale: [1, 1.14, 1] }}
          transition={{ duration: 21, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
        <LangToggle />
        <ThemeToggle />
      </div>

      {/* Brand side */}
      <aside className="relative z-10 hidden items-center justify-center overflow-hidden px-12 text-center lg:flex">
        <div className="absolute top-0 left-0 z-10 p-10 xl:p-12">
          <Logo />
        </div>

        <div className="relative z-10 flex max-w-md flex-col items-center">
          <div className="relative grid place-items-center">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                aria-hidden
                className="absolute size-44 rounded-full border border-brand-red/25 dark:border-brand-cream/20"
                initial={{ scale: 0.65, opacity: 0 }}
                animate={{ scale: 2.1, opacity: [0, 0.55, 0] }}
                transition={{ duration: 3.8, repeat: Infinity, delay: i * 1.25, ease: "easeOut" }}
              />
            ))}
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              <div className="absolute inset-0 -z-10 rounded-full bg-brand-cream/25 blur-2xl" />
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              >
                <LogoMark className="size-28 text-3xl drop-shadow-2xl" />
              </motion.div>
            </motion.div>
          </div>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="font-heading mt-14 text-[2.1rem] leading-tight font-extrabold tracking-tight text-foreground xl:text-[2.5rem]"
          >
            Streamline your{" "}
            <span className="text-brand-red">
              supply chain.
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.42, duration: 0.6 }}
            className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted-foreground"
          >
            Manage purchase orders, submit invoices, track payments, and maintain compliance — all in one secure portal.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.54, duration: 0.6 }}
            className="mt-8 flex flex-col gap-3 text-left"
          >
            {[
              "Real-time PO acknowledgement & tracking",
              "VAT-compliant invoice submission",
              "BEFTN payment reconciliation",
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <span className="size-1.5 rounded-full bg-brand-cream shrink-0" />
                {feat}
              </div>
            ))}
          </motion.div>
        </div>

        <div className="absolute bottom-0 left-0 z-10 p-10 text-xs text-muted-foreground/70 xl:p-12">
          Powered by Kazi Farms ERP
        </div>
      </aside>

      {/* Form panel */}
      <div className="relative z-10 flex min-h-dvh items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="glass-raised relative w-full max-w-md p-8"
        >
          <div className="mb-6 flex justify-center lg:hidden">
            <div className="relative">
              <div className="absolute inset-0 -z-10 rounded-full bg-brand-cream/20 blur-xl" />
              <LogoMark className="size-14 text-2xl" />
            </div>
          </div>

          <AnimatePresence mode="wait">
            {step === "credentials" ? (
              <motion.div
                key="credentials"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25 }}
              >
                <h1 className="font-heading text-2xl font-bold text-foreground">
                  Sign in to your portal
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Welcome back. Enter your supplier credentials to continue.
                </p>

                <form onSubmit={onCreds} className="mt-6 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Work email</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="email"
                        type="email"
                        autoComplete="username"
                        {...form.register("email")}
                        className="h-11 w-full rounded-xl border border-border bg-muted/40 pr-3 pl-9 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/50"
                      />
                    </div>
                    {form.formState.errors.email && (
                      <p className="text-xs text-danger">{form.formState.errors.email.message}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <button
                        type="button"
                        onClick={() => toast.info("Contact your administrator to reset access.")}
                        className="text-xs font-medium text-primary hover:underline dark:text-brand-cream"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="password"
                        type={showPw ? "text" : "password"}
                        autoComplete="current-password"
                        {...form.register("password")}
                        className="h-11 w-full rounded-xl border border-border bg-muted/40 pr-10 pl-9 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPw ? "Hide password" : "Show password"}
                      >
                        {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    {form.formState.errors.password && (
                      <p className="text-xs text-danger">{form.formState.errors.password.message}</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    disabled={submitting}
                    className="h-11 w-full gap-2 bg-gradient-to-r from-brand-red to-brand-red-700 text-base text-white shadow-lg shadow-brand-red/25 transition-shadow hover:from-brand-red-600 hover:to-brand-red-700 hover:shadow-brand-red/40"
                  >
                    {submitting ? (
                      <><Loader2 className="size-4 animate-spin" /> Signing in…</>
                    ) : (
                      <>Continue <ArrowRight className="size-4" /></>
                    )}
                  </Button>

                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                    <Lock className="size-3" />
                    Secured with bank-grade 256-bit TLS encryption
                  </div>

                  <p className="rounded-lg bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
                    Demo credentials are prefilled — just click Continue.
                  </p>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25 }}
              >
                <button
                  type="button"
                  onClick={() => { setStep("credentials"); setOtp(""); setOtpError(null); }}
                  className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-3.5" /> Back
                </button>

                <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20 dark:text-brand-cream dark:ring-brand-cream/25">
                  <Fingerprint className="size-6" />
                </div>
                <h1 className="font-heading text-2xl font-bold text-foreground">
                  Two-factor verification
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter the 6-digit code sent to{" "}
                  <span className="font-medium text-foreground">{OTP_DESTINATION}</span>.
                </p>

                <div className="mt-6 space-y-3">
                  <OtpInput
                    value={otp}
                    onChange={(v) => { setOtp(v); if (otpError && !locked) setOtpError(null); }}
                    onComplete={(v) => verify(v)}
                    autoFocus
                    invalid={!!otpError}
                    disabled={locked || verifying}
                  />

                  {otpError ? (
                    <div className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
                      <TriangleAlert className="mt-px size-3.5 shrink-0" />
                      <span>{otpError}</span>
                    </div>
                  ) : (
                    <p className="rounded-lg bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
                      Demo code:{" "}
                      <span className="tnum font-semibold text-foreground tracking-[0.3em]">
                        {EXPECTED_OTP}
                      </span>
                    </p>
                  )}

                  <Button
                    type="button"
                    size="lg"
                    disabled={otp.length < 6 || verifying || locked}
                    onClick={() => verify()}
                    className="h-11 w-full gap-2 bg-gradient-to-r from-brand-red to-brand-red-700 text-base text-white shadow-lg shadow-brand-red/25 transition-shadow hover:from-brand-red-600 hover:to-brand-red-700 hover:shadow-brand-red/40"
                  >
                    {verifying ? (
                      <><Loader2 className="size-4 animate-spin" /> Verifying…</>
                    ) : (
                      <>Verify &amp; sign in <ArrowRight className="size-4" /></>
                    )}
                  </Button>

                  <div className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                    {locked ? (
                      <span className="text-danger">Account locked</span>
                    ) : resendIn > 0 ? (
                      <span>
                        Resend code in{" "}
                        <span className="tnum font-medium text-foreground">{resendIn}s</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={resend}
                        className="inline-flex items-center gap-1 font-semibold text-primary hover:underline dark:text-brand-cream"
                      >
                        <RefreshCw className="size-3.5" /> Resend code
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
