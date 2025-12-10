"use client";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import React, { useState, useEffect } from "react";
import { cn } from "@/utils/cn";

interface TiltCardProps {
    children: React.ReactNode;
    className?: string;
}

export const TiltCard = ({ children, className }: TiltCardProps) => {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        // Detect mobile/tablet devices
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 1024); // Disable on tablets and mobile
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const x = useMotionValue(0);
    const y = useMotionValue(0);

    // Reduced spring stiffness for better performance
    const mouseX = useSpring(x, { stiffness: 100, damping: 20 });
    const mouseY = useSpring(y, { stiffness: 100, damping: 20 });

    function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
        if (isMobile) return; // Skip on mobile

        const { left, top, width, height } = currentTarget.getBoundingClientRect();
        const xPct = (clientX - left) / width - 0.5;
        const yPct = (clientY - top) / height - 0.5;
        x.set(xPct);
        y.set(yPct);
    }

    function handleMouseLeave() {
        if (isMobile) return; // Skip on mobile
        x.set(0);
        y.set(0);
    }

    // Calculate rotation based on mouse position
    const rotateX = useTransform(mouseY, [-0.5, 0.5], ["10deg", "-10deg"]);
    const rotateY = useTransform(mouseX, [-0.5, 0.5], ["-10deg", "10deg"]);

    // If mobile, render simple div without 3D effects
    if (isMobile) {
        return (
            <div
                className={cn(
                    "relative h-auto w-full rounded-xl border p-6 transition-all group",
                    className
                )}
            >
                <div className="relative z-10">
                    {children}
                </div>
            </div>
        );
    }

    return (
        <motion.div
            style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className={cn(
                "relative h-auto w-full rounded-xl border p-6 transition-all group",
                className
            )}
        >
            <div style={{ transform: "translateZ(50px)" }} className="relative z-10">
                {children}
            </div>

            {/* Moving Spotlight Effect */}
            <motion.div
                className="absolute -inset-px opacity-0 group-hover:opacity-100 transition duration-500 rounded-xl z-0 pointer-events-none"
                style={{
                    background: useTransform(mouseX, [-0.5, 0.5], [
                        "radial-gradient(600px circle at 0px 0px, rgba(168,85,247,0.1), transparent 40%)",
                        "radial-gradient(600px circle at 100% 100%, rgba(168,85,247,0.1), transparent 40%)"
                    ])
                }}
            />
        </motion.div>
    );
};

