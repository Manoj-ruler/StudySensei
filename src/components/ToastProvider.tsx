'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { ToastContainer, Toast } from './ui/toast'

interface ToastContextType {
    addToast: (type: Toast['type'], message: string, duration?: number) => void
    success: (message: string, duration?: number) => void
    error: (message: string, duration?: number) => void
    warning: (message: string, duration?: number) => void
    info: (message: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, [])

    const addToast = useCallback((type: Toast['type'], message: string, duration?: number) => {
        const id = Math.random().toString(36).substring(7)
        const newToast: Toast = { id, type, message, duration }
        setToasts((prev) => [...prev, newToast])
    }, [])

    const success = useCallback((message: string, duration?: number) => {
        addToast('success', message, duration)
    }, [addToast])

    const error = useCallback((message: string, duration?: number) => {
        addToast('error', message, duration)
    }, [addToast])

    const warning = useCallback((message: string, duration?: number) => {
        addToast('warning', message, duration)
    }, [addToast])

    const info = useCallback((message: string, duration?: number) => {
        addToast('info', message, duration)
    }, [addToast])

    return (
        <ToastContext.Provider value={{ addToast, success, error, warning, info }}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={removeToast} />
        </ToastContext.Provider>
    )
}

export function useToast() {
    const context = useContext(ToastContext)
    if (!context) {
        throw new Error('useToast must be used within ToastProvider')
    }
    return context
}
