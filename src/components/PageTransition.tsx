'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{
          opacity: 1,
          y: 0,
          transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
        }}
        exit={{
          opacity: 0,
          y: -6,
          transition: { duration: 0.2, ease: 'easeIn' as const },
        }}
        className="h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}