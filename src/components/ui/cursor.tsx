"use client";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useState } from "react";

export default function Cursor() {
    const cursorX = useMotionValue(-100);
    const cursorY = useMotionValue(-100);

    // Use state to track if we should render (client-side only to avoid hydration mismatch)
    const [mounted, setMounted] = useState(false);

    const springConfig = { damping: 25, stiffness: 700 };
    const cursorXSpring = useSpring(cursorX, springConfig);
    const cursorYSpring = useSpring(cursorY, springConfig);

    const dotXSpring = useSpring(cursorX, { damping: 40, stiffness: 1000 });
    const dotYSpring = useSpring(cursorY, { damping: 40, stiffness: 1000 });

    useEffect(() => {
        setMounted(true);
        const moveCursor = (e: MouseEvent) => {
            cursorX.set(e.clientX - 16); // offset by half width
            cursorY.set(e.clientY - 16);
        };
        window.addEventListener("mousemove", moveCursor);
        return () => window.removeEventListener("mousemove", moveCursor);
    }, []);

    if (!mounted) return null;

    return (
        <>
            <motion.div
                className="fixed top-0 left-0 w-8 h-8 rounded-full border border-indigo-500/50 bg-indigo-500/10 pointer-events-none z-[9999] backdrop-blur-sm shadow-[0_0_20px_rgba(99,102,241,0.5)]"
                style={{
                    translateX: cursorXSpring,
                    translateY: cursorYSpring,
                }}
            />
            {/* Tiny primary dot */}
            <motion.div
                className="fixed top-0 left-0 w-2 h-2 rounded-full bg-indigo-400 pointer-events-none z-[9999]"
                style={{
                    translateX: dotXSpring,
                    translateY: dotYSpring,
                    marginLeft: 12,
                }}
            />
        </>
    );
}
