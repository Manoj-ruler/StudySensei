import Link from 'next/link'
import { GraduationCap } from 'lucide-react'

export default function NotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50 p-6">
            <div className="max-w-md w-full text-center">
                <GraduationCap className="mx-auto h-12 w-12 text-purple-600 mb-4" />
                <p className="text-sm font-semibold text-purple-600 mb-2">404</p>
                <h1 className="text-3xl font-bold text-gray-900 mb-3">Page not found</h1>
                <p className="text-gray-600 mb-8">
                    That page does not exist, or it belongs to a skill that has been deleted.
                </p>
                <Link
                    href="/dashboard"
                    className="inline-flex items-center justify-center bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
                >
                    Go to your dashboard
                </Link>
            </div>
        </div>
    )
}
