'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

export interface Toast {
    id: string
    type: 'success' | 'error' | 'warning' | 'info'
    message: string
    duration?: number
}

interface ToastProps {
    toast: Toast
    onDismiss: (id: string) => void
}

const toastConfig = {
    success: {
        icon: CheckCircle,
        gradient: 'from-green-500 to-emerald-500',
        bg: 'bg-green-50',
        border: 'border-green-200',
        text: 'text-green-900',
        iconColor: 'text-green-600'
    },
    error: {
        icon: XCircle,
        gradient: 'from-red-500 to-rose-500',
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-900',
        iconColor: 'text-red-600'
    },
    warning: {
        icon: AlertTriangle,
        gradient: 'from-orange-500 to-amber-500',
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        text: 'text-orange-900',
        iconColor: 'text-orange-600'
    },
    info: {
        icon: Info,
        gradient: 'from-blue-500 to-cyan-500',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-900',
        iconColor: 'text-blue-600'
    }
}

export function ToastItem({ toast, onDismiss }: ToastProps) {
    const config = toastConfig[toast.type]
    const Icon = config.icon

    useEffect(() => {
        const duration = toast.duration || 4000
        const timer = setTimeout(() => {
            onDismiss(toast.id)
        }, duration)

        return () => clearTimeout(timer)
    }, [toast.id, toast.duration, onDismiss])

    return (
        <motion.div
            initial={{ opacity: 0, y: -20, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className={`${config.bg} ${config.border} border-2 rounded-xl shadow-lg p-4 min-w-[320px] max-w-md backdrop-blur-sm`}
        >
            <div className="flex items-start gap-3">
                <div className={`flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br ${config.gradient} flex items-center justify-center`}>
                    <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`${config.text} text-sm font-medium leading-relaxed`}>
                        {toast.message}
                    </p>
                </div>
                <button
                    onClick={() => onDismiss(toast.id)}
                    className={`flex-shrink-0 ${config.iconColor} hover:opacity-70 transition-opacity`}
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </motion.div>
    )
}

interface ToastContainerProps {
    toasts: Toast[]
    onDismiss: (id: string) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
    return (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
            <AnimatePresence>
                {toasts.map((toast) => (
                    <div key={toast.id} className="pointer-events-auto">
                        <ToastItem toast={toast} onDismiss={onDismiss} />
                    </div>
                ))}
            </AnimatePresence>
        </div>
    )
}
