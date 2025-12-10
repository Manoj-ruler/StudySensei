import { GraduationCap } from 'lucide-react'

export default function HomeFooter() {
    return (
        <footer className="relative z-10 bg-transparent border-t border-gray-200/50 mt-auto">
            <div className="max-w-7xl mx-auto px-6 py-12">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-2">
                        <GraduationCap className="h-6 w-6 text-purple-600" />
                        <span className="text-lg font-bold text-gray-900">StudySensei</span>
                    </div>
                    <p className="text-gray-600 text-sm">© 2025 StudySensei. All rights reserved.</p>
                </div>
            </div>
        </footer>
    )
}
