'use client'

import { useParams } from 'next/navigation'
import AnalyticsDashboard from '@/components/AnalyticsDashboard'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import DashboardHeader from '@/components/DashboardHeader'
import HomeFooter from '@/components/HomeFooter'
import { motion } from 'framer-motion'
import { GlassPanel } from '@/components/ui/glass-panel'

export default function AnalyticsPage() {
    const params = useParams()
    const id = params.id as string

    return (
        <div className="h-full flex flex-col bg-gradient-to-br from-purple-50 via-white to-pink-50 relative">
            <DashboardHeader />
            {/* Background Effects */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-purple-200/40 rounded-full blur-[120px] mix-blend-multiply opacity-50" />
                <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-pink-200/40 rounded-full blur-[100px] mix-blend-multiply opacity-50" />
            </div>

            <div className="flex-1 max-w-7xl mx-auto p-8 relative z-10 w-full">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="mb-8"
                >
                    <Link href="/dashboard">
                        <GlassPanel className="inline-flex items-center px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors group bg-white/50 border-white/60">
                            <ChevronLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
                            Back to Dashboard
                        </GlassPanel>
                    </Link>
                </motion.div>

                <AnalyticsDashboard skillId={id} />
            </div>

            <HomeFooter />
        </div>
    )
}
