'use client'

import React, { useEffect, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LineChart, Line, AreaChart, Area
} from 'recharts';
import { Loader2, TrendingUp, Award, Code, Activity } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { GlassPanel } from '@/components/ui/glass-panel';
import { motion } from 'framer-motion';

interface AnalyticsProps {
    skillId: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <GlassPanel className="p-4 !rounded-lg border-purple-200 shadow-xl bg-white/90">
                <p className="text-gray-800 font-medium text-sm mb-1">{label}</p>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <p className="text-gray-500 text-xs">
                        {payload[0].name}: <span className="text-gray-900 font-bold">{payload[0].value}</span>
                    </p>
                </div>
            </GlassPanel>
        );
    }
    return null;
};

export default function AnalyticsDashboard({ skillId }: AnalyticsProps) {
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        fetchAnalytics()
    }, [skillId])

    const fetchAnalytics = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const response = await fetch(`http://localhost:8000/analytics/skill/${skillId}?user_id=${user.id}`)
            const resData = await response.json()
            setData(resData)
        } catch (error) {
            console.error("Failed to fetch analytics", error)
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center p-20">
                <div className="relative">
                    <div className="absolute inset-0 bg-purple-200/50 blur-xl rounded-full" />
                    <Loader2 className="h-10 w-10 animate-spin text-purple-600 relative z-10" />
                </div>
            </div>
        )
    }

    if (!data) return (
        <GlassPanel className="p-8 text-center text-gray-500">
            No data available for this timeline.
        </GlassPanel>
    )

    const { summary, history } = data

    // Group activities by type
    const activityByType = history.reduce((acc: any, h: any) => {
        const type = h.activity_type
        if (!acc[type]) {
            acc[type] = { type, count: 0, totalScore: 0 }
        }
        acc[type].count += 1
        acc[type].totalScore += h.score || 0
        return acc
    }, {})

    const activityTypeData = Object.values(activityByType).map((item: any) => ({
        type: item.type === 'quiz' ? 'Quizzes' : item.type === 'code' ? 'Coding' : 'Chat',
        count: item.count,
        avgScore: item.count > 0 ? (item.totalScore / item.count).toFixed(1) : 0
    }))

    const CustomBarTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <GlassPanel className="p-4 !rounded-lg border-purple-200 shadow-xl bg-white/90">
                    <p className="text-gray-800 font-medium text-sm mb-2">{label}</p>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-purple-500" />
                            <p className="text-gray-600 text-xs">
                                Count: <span className="text-gray-900 font-bold">{payload[0].value}</span>
                            </p>
                        </div>
                        <p className="text-gray-500 text-xs ml-4">
                            Avg Score: <span className="text-gray-900 font-semibold">{payload[0].payload.avgScore}</span>
                        </p>
                    </div>
                </GlassPanel>
            );
        }
        return null;
    };

    return (
        <div className="space-y-8">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 mb-8"
            >
                <div className="p-2 bg-purple-50 rounded-lg border border-purple-100 text-purple-600">
                    <Activity className="h-6 w-6" />
                </div>
                <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                    Performance Telemetry
                </h2>
            </motion.div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <GlassPanel className="p-6 relative overflow-hidden group hover:shadow-lg transition-all bg-white/80">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <TrendingUp className="h-16 w-16 text-purple-600" />
                        </div>
                        <p className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-2">Total Quizzes</p>
                        <p className="text-4xl font-mono font-bold text-gray-800 group-hover:text-purple-600 transition-colors">
                            {summary.total_quizzes}
                        </p>
                        <div className="mt-4 h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-purple-500 to-pink-400 w-[70%]" />
                        </div>
                    </GlassPanel>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <GlassPanel className="p-6 relative overflow-hidden group hover:shadow-lg transition-all bg-white/80">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Award className="h-16 w-16 text-pink-500" />
                        </div>
                        <p className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-2">Average Score</p>
                        <p className="text-4xl font-mono font-bold text-gray-800 group-hover:text-pink-600 transition-colors">
                            {!summary.combined_avg_score || isNaN(summary.combined_avg_score) ? 'N/A' : `${(summary.combined_avg_score * 100).toFixed(0)}%`}
                        </p>
                        <div className="mt-4 h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-pink-500 to-orange-400 transition-all duration-500"
                                style={{ width: `${!summary.combined_avg_score || isNaN(summary.combined_avg_score) ? 0 : summary.combined_avg_score * 100}%` }}
                            />
                        </div>
                    </GlassPanel>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <GlassPanel className="p-6 relative overflow-hidden group hover:shadow-lg transition-all bg-white/80">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Code className="h-16 w-16 text-purple-500" />
                        </div>
                        <p className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-2">Coding Challenges</p>
                        <p className="text-4xl font-mono font-bold text-gray-800 group-hover:text-purple-600 transition-colors">
                            {summary.code_challenges_solved}
                        </p>
                        <div className="mt-4 h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 w-[40%]" />
                        </div>
                    </GlassPanel>
                </motion.div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 }}
                    className="h-[400px]"
                >
                    <GlassPanel className="h-full p-6 flex flex-col bg-white/80">
                        <h3 className="text-lg font-semibold text-gray-800 mb-6">Activity Type Breakdown</h3>
                        <div className="flex-1 w-full min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={activityTypeData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                                    <XAxis
                                        dataKey="type"
                                        stroke="#9ca3af"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        dy={10}
                                    />
                                    <YAxis
                                        stroke="#9ca3af"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        dx={-10}
                                        label={{ value: 'Count', angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: '#6b7280' } }}
                                    />
                                    <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(168, 85, 247, 0.1)' }} />
                                    <Bar
                                        dataKey="count"
                                        fill="url(#barGradient)"
                                        radius={[8, 8, 0, 0]}
                                    />
                                    <defs>
                                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#a855f7" stopOpacity={0.8} />
                                            <stop offset="100%" stopColor="#ec4899" stopOpacity={0.6} />
                                        </linearGradient>
                                    </defs>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </GlassPanel>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 }}
                    className="h-[400px]"
                >
                    <GlassPanel className="h-full p-6 flex flex-col bg-white/80">
                        <h3 className="text-lg font-semibold text-gray-800 mb-6">Recent Activity Breakdown</h3>
                        <div className="flex-1 flex flex-col justify-center space-y-6">
                            {/* Quiz Activity */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-purple-50 rounded-lg">
                                            <Award className="h-5 w-5 text-purple-600" />
                                        </div>
                                        <span className="text-gray-700 font-medium">Quizzes Taken</span>
                                    </div>
                                    <span className="text-2xl font-bold text-gray-800">{summary.total_quizzes}</span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full transition-all duration-500"
                                        style={{ width: `${Math.min((summary.total_quizzes / 10) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>

                            {/* Code Activity */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-pink-50 rounded-lg">
                                            <Code className="h-5 w-5 text-pink-600" />
                                        </div>
                                        <span className="text-gray-700 font-medium">Challenges Solved</span>
                                    </div>
                                    <span className="text-2xl font-bold text-gray-800">{summary.code_challenges_solved}</span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-pink-500 to-pink-400 rounded-full transition-all duration-500"
                                        style={{ width: `${Math.min((summary.code_challenges_solved / 10) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </GlassPanel>
                </motion.div>
            </div>
        </div>
    )
}
