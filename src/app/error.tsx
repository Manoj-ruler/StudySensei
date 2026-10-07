'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string }
    retry: () => void
}) {
    useEffect(() => {
        console.error(error)
    }, [error])

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50 p-6">
            <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 shadow-xl p-8 text-center">
                <div className="mx-auto mb-5 h-14 w-14 rounded-full bg-red-50 flex items-center justify-center">
                    <AlertTriangle className="h-7 w-7 text-red-500" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
                <p className="text-gray-600 mb-6">
                    This page hit an unexpected error. Your data is safe; try again, or go back to your dashboard.
                </p>
                {error.digest && (
                    <p className="text-xs text-gray-400 mb-6">Reference: {error.digest}</p>
                )}
                <div className="flex gap-3">
                    <button
                        onClick={() => retry()}
                        className="flex-1 inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-xl font-semibold transition-colors"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Try again
                    </button>
                    <Link
                        href="/dashboard"
                        className="flex-1 inline-flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl font-semibold transition-colors"
                    >
                        Dashboard
                    </Link>
                </div>
            </div>
        </div>
    )
}
