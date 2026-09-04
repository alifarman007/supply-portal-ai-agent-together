"use client";

import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
  useReducedMotion,
} from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  Leaf,
  Loader2,
  Lock,
  Mail,
  Package,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/shell/Logo";
import { AnimatedChickenMark } from "@/components/shell/AnimatedChickenMark";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { LangToggle } from "@/components/shell/LangToggle";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/store/auth";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TRUST_ITEMS = [
  "ISO 22000 Certified",
  "HACCP Compliant",
  "NBR VAT Registered",
  "BEFTN Enabled",
  "256-bit TLS Encrypted",
];

const credsSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
type Creds = z.infer<typeof credsSchema>;

const wordVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.06 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

function Magnetic({
  children,
  strength = 16,
}: {
  children: ReactNode;
  strength?: number;
}) {
  const prefersReducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 250, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 250, damping: 18, mass: 0.4 });

  const handleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || e.pointerType !== "mouse") return;
    const rect = e.currentTarget.getBoundingClientRect();
    x.set(((e.clientX - rect.left) / rect.width - 0.5) * strength);
    y.set(((e.clientY - rect.top) / rect.height - 0.5) * strength);
  };

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div style={{ x: sx, y: sy }} onPointerMove={handleMove} onPointerLeave={reset}>
      {children}
    </motion.div>
  );
}

function FloatingChip({
  mouseX,
  mouseY,
  depth,
  duration,
  className,
  children,
}: {
  mouseX: ReturnType<typeof useMotionValue<number>>;
  mouseY: ReturnType<typeof useMotionValue<number>>;
  depth: number;
  duration: number;
  className: string;
  children: ReactNode;
}) {
  const prefersReducedMotion = useReducedMotion();
  const px = useTransform(mouseX, [-0.5, 0.5], [-depth, depth]);
  const py = useTransform(mouseY, [-0.5, 0.5], [-depth, depth]);
  const spx = useSpring(px, { stiffness: 50, damping: 14 });
  const spy = useSpring(py, { stiffness: 50, damping: 14 });

  return (
    <motion.div
      className={`absolute z-10 ${className}`}
      style={prefersReducedMotion ? undefined : { x: spx, y: spy }}
    >
      <motion.div
        animate={prefersReducedMotion ? undefined : { y: [0, -10, 0] }}
        transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
        className="glass grid size-12 place-items-center rounded-2xl shadow-lg xl:size-14"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const login = useAuth((s) => s.login);
  const prefersReducedMotion = useReducedMotion();

  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Page-level pointer tracking, normalized to -0.5..0.5, drives the
  // spotlight glow and the floating icon parallax together.
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const spotX = useMotionValue(50);
  const spotY = useMotionValue(50);
  const spotlightBg = useMotionTemplate`radial-gradient(650px circle at ${spotX}% ${spotY}%, var(--glow-red), transparent 70%)`;

  // Local pointer tracking within the form card, drives the 3D tilt.
  const cardRotateX = useMotionValue(0);
  const cardRotateY = useMotionValue(0);
  const springRotateX = useSpring(cardRotateX, { stiffness: 200, damping: 22 });
  const springRotateY = useSpring(cardRotateY, { stiffness: 200, damping: 22 });

  const form = useForm<Creds>({
    resolver: zodResolver(credsSchema),
    defaultValues: {
      email: "ahsan.kabir@dhakapackaging.com.bd",
      password: "Demo@2026!",
    },
  });

  const handlePageMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || e.pointerType !== "mouse") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    spotX.set(relX * 100);
    spotY.set(relY * 100);
    mouseX.set(relX - 0.5);
    mouseY.set(relY - 0.5);
  };

  const handleCardMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || e.pointerType !== "mouse") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width - 0.5;
    const relY = (e.clientY - rect.top) / rect.height - 0.5;
    cardRotateY.set(relX * 10);
    cardRotateX.set(relY * -10);
  };

  const resetCardTilt = () => {
    cardRotateX.set(0);
    cardRotateY.set(0);
  };

  const onCreds = form.handleSubmit(async () => {
    setSubmitting(true);
    await wait(750);
    setSubmitting(false);
    setShowSuccess(true);
    login();
    toast.success("Signed in", { description: "Welcome to the Kazi Farms Supplier Portal." });
    await wait(prefersReducedMotion ? 200 : 900);
    router.push("/app");
  });

  return (
    <div
      className="relative min-h-dvh overflow-hidden lg:grid lg:grid-cols-2"
      onPointerMove={handlePageMove}
    >
      {/* aurora background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <motion.div
          className="absolute top-[-6rem] left-[-5rem] size-[40rem] rounded-full bg-brand-red/25 blur-[150px] dark:bg-brand-red/40"
          animate={prefersReducedMotion ? undefined : { x: [0, 60, 0], y: [0, 36, 0], scale: [1, 1.12, 1] }}
          transition={{ duration: 19, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-1/4 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-brand-cream/20 blur-[160px] dark:bg-brand-cream/12"
          animate={prefersReducedMotion ? undefined : { y: [0, 44, 0], scale: [1, 1.18, 1] }}
          transition={{ duration: 23, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-[-5rem] bottom-[-7rem] size-[36rem] rounded-full bg-brand-red/20 blur-[150px] dark:bg-info/22"
          animate={prefersReducedMotion ? undefined : { x: [0, -46, 0], y: [0, -30, 0], scale: [1, 1.14, 1] }}
          transition={{ duration: 21, repeat: Infinity, ease: "easeInOut" }}
        />
        {!prefersReducedMotion && (
          <motion.div
            aria-hidden
            className="absolute inset-0"
            style={{ background: spotlightBg }}
          />
        )}
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

        {!prefersReducedMotion && (
          <>
            <FloatingChip mouseX={mouseX} mouseY={mouseY} depth={22} duration={7} className="top-[14%] left-[10%]">
              <Truck className="size-5 text-primary xl:size-6" strokeWidth={1.75} />
            </FloatingChip>
            <FloatingChip mouseX={mouseX} mouseY={mouseY} depth={-18} duration={8.5} className="top-[20%] right-[8%]">
              <Package className="size-5 text-primary xl:size-6" strokeWidth={1.75} />
            </FloatingChip>
            <FloatingChip mouseX={mouseX} mouseY={mouseY} depth={16} duration={6.5} className="bottom-[26%] left-[6%]">
              <Leaf className="size-5 text-primary xl:size-6" strokeWidth={1.75} />
            </FloatingChip>
            <FloatingChip mouseX={mouseX} mouseY={mouseY} depth={-24} duration={9} className="right-[10%] bottom-[16%]">
              <ShieldCheck className="size-5 text-primary xl:size-6" strokeWidth={1.75} />
            </FloatingChip>
          </>
        )}

        <div className="relative z-10 flex max-w-md flex-col items-center">
          <div className="relative grid place-items-center">
            {!prefersReducedMotion &&
              [0, 1, 2].map((i) => (
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
              <AnimatedChickenMark className="size-28 text-3xl drop-shadow-2xl" />
            </motion.div>
          </div>

          <motion.h2
            initial="hidden"
            animate="visible"
            className="font-heading mt-14 flex flex-wrap justify-center gap-x-[0.3em] text-[2.1rem] leading-tight font-extrabold tracking-tight text-foreground xl:text-[2.5rem]"
          >
            {["Streamline", "your"].map((w, i) => (
              <motion.span key={w} custom={i} variants={wordVariants} className="inline-block">
                {w}
              </motion.span>
            ))}
            <motion.span custom={2} variants={wordVariants} className="inline-block text-brand-red">
              supply chain.
            </motion.span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted-foreground"
          >
            Manage purchase orders, submit invoices, track payments, and maintain compliance — all in one secure portal.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.52, duration: 0.6 }}
            className="mt-8 flex flex-col gap-3 text-left"
          >
            {[
              "Real-time PO acknowledgement & tracking",
              "VAT-compliant invoice submission",
              "BEFTN payment reconciliation",
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary shrink-0 dark:bg-brand-cream" />
                {feat}
              </div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="mt-10 w-full max-w-md overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
          >
            <div className="animate-marquee flex w-max items-center gap-8 whitespace-nowrap hover:[animation-play-state:paused]">
              {[...TRUST_ITEMS, ...TRUST_ITEMS].map((item, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground/70">
                  <BadgeCheck className="size-3.5 text-primary" /> {item}
                </span>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="absolute bottom-0 left-0 z-10 p-10 text-xs text-muted-foreground/70 xl:p-12">
          Powered by Kazi Farms ERP
        </div>
      </aside>

      {/* Form panel */}
      <div className="relative z-10 flex min-h-dvh items-center justify-center p-6" style={{ perspective: 1400 }}>
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          onPointerMove={handleCardMove}
          onPointerLeave={resetCardTilt}
          style={{ rotateX: springRotateX, rotateY: springRotateY, transformStyle: "preserve-3d" }}
          className="glass-raised relative w-full max-w-md p-8"
        >
          <div className="mb-6 flex justify-center lg:hidden">
            <div className="relative">
              <div className="absolute inset-0 -z-10 rounded-full bg-brand-cream/20 blur-xl" />
              <LogoMark className="size-14 text-2xl" />
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
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

              <Magnetic>
                <Button
                  type="submit"
                  size="lg"
                  disabled={submitting}
                  className="group relative h-11 w-full gap-2 overflow-hidden bg-gradient-to-r from-brand-red to-brand-red-700 text-base text-white shadow-lg shadow-brand-red/25 transition-shadow hover:from-brand-red-600 hover:to-brand-red-700 hover:shadow-brand-red/40"
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-1/3 -translate-x-[150%] skew-x-[-20deg] bg-white/25 transition-transform duration-700 ease-out group-hover:translate-x-[350%]"
                  />
                  {submitting ? (
                    <><Loader2 className="size-4 animate-spin" /> Signing in…</>
                  ) : (
                    <>Continue <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></>
                  )}
                </Button>
              </Magnetic>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                <Lock className="size-3" />
                Secured with bank-grade 256-bit TLS encryption
              </div>

              <p className="rounded-lg bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
                Demo credentials are prefilled — just click Continue.
              </p>
            </form>
          </motion.div>
        </motion.div>
      </div>

      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="flex flex-col items-center gap-4"
            >
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: [0.8, 1.15, 1] }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="grid size-20 place-items-center rounded-full bg-primary/15 text-primary ring-4 ring-primary/20"
              >
                <CheckCircle2 className="size-10" />
              </motion.div>
              <p className="font-heading text-lg font-semibold text-foreground">Signed in successfully</p>
              <p className="text-sm text-muted-foreground">Redirecting to your dashboard…</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
