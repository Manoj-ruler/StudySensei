import { cn } from "@/utils/cn";
import React from "react";

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    hoverEffect?: boolean;
}

export const GlassPanel = ({ children, className, hoverEffect = false, ...props }: GlassPanelProps) => {
    return (
        <div
            className={cn(
                "relative backdrop-blur-2xl backdrop-saturate-[180%] bg-white/70",
                "border border-white/60 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
                "overflow-hidden transition-all duration-500",
                hoverEffect && "hover:bg-white/80 hover:border-white/80 hover:shadow-[0_8px_30px_rgba(99,102,241,0.1)] group",
                className
            )}
            {...props}
        >
            {/* Inner top highlight for depth - White for light theme */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80" />

            {children}
        </div>
    );
};
