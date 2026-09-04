"use client";

import { motion, useReducedMotion } from "framer-motion";
import { LogoMark } from "./Logo";

const FEATHERS = [
  { offsetX: -40, delay: 0, duration: 3.6, width: 9, rotate: -20 },
  { offsetX: 36, delay: 1.3, duration: 4, width: 7, rotate: 24 },
  { offsetX: -8, delay: 2.5, duration: 3.3, width: 8, rotate: -4 },
];

export function AnimatedChickenMark({ className }: { className?: string }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="relative grid place-items-center">
      {!prefersReducedMotion &&
        FEATHERS.map((f, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute bottom-4 rounded-[60%_40%_60%_40%] bg-brand-cream-600 shadow-sm"
            style={{ width: f.width, height: f.width * 1.7, left: `calc(50% + ${f.offsetX}px)` }}
            initial={{ y: 0, opacity: 0, rotate: f.rotate }}
            animate={{ y: [-6, -78], opacity: [0, 0.9, 0], rotate: [f.rotate, f.rotate + 50] }}
            transition={{ duration: f.duration, repeat: Infinity, delay: f.delay, ease: "easeOut" }}
          />
        ))}

      {/* Idle motion: a gentle bob that dips into a quick peck, then a
          feather-ruffle squash/stretch as the hen resettles. */}
      <motion.div
        animate={
          prefersReducedMotion
            ? undefined
            : {
                y: [0, -9, -9, 0, 0, 0],
                rotate: [0, 0, -10, 5, 0, 0],
                scaleX: [1, 1, 1.035, 0.98, 1, 1],
                scaleY: [1, 1, 0.965, 1.02, 1, 1],
              }
        }
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "easeInOut",
          times: [0, 0.38, 0.48, 0.58, 0.68, 1],
        }}
      >
        <LogoMark className={className} />
      </motion.div>
    </div>
  );
}
