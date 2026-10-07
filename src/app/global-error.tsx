'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'

/**
 * Replaces the root layout when the layout itself fails, so it must render
 * its own <html> and <body> and cannot rely on the app's styles or providers.
 */
export default function GlobalError({
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
        <html lang="en">
            <body
                style={{
                    margin: 0,
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'system-ui, sans-serif',
                    background: '#faf5ff',
                    color: '#111827',
                }}
            >
                <div style={{ maxWidth: 420, padding: 32, textAlign: 'center' }}>
                    <h1 style={{ fontSize: 24, marginBottom: 8 }}>StudySensei could not load</h1>
                    <p style={{ color: '#4b5563', marginBottom: 24 }}>
                        An unexpected error stopped the page from loading. Please try again.
                    </p>
                    <button
                        onClick={() => retry()}
                        style={{
                            background: '#9333ea',
                            color: '#fff',
                            border: 0,
                            borderRadius: 12,
                            padding: '10px 24px',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        Try again
                    </button>
                </div>
            </body>
        </html>
    )
}
