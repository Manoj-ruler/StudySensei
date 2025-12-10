'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { GraduationCap, LogOut, Home } from 'lucide-react'
import Link from 'next/link'

export default function DashboardHeader() {
    const [user, setUser] = useState<any>(null)
    const [userProfile, setUserProfile] = useState<any>(null)
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            setUser(user)

            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single()
                setUserProfile(profile)
            }
        }
        getUser()
    }, [supabase])

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push('/')
    }

    return (
        <nav className="relative z-10">
            <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <GraduationCap className="h-6 w-6 text-purple-600" />
                    <span className="text-xl font-bold text-gray-900">StudySensei</span>
                </div>
                <div className="flex items-center gap-6">
                    <Link href="/">
                        <button className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium flex items-center gap-2">
                            <Home className="h-4 w-4" />
                            Home
                        </button>
                    </Link>
                    <span className="text-gray-600 text-sm hidden md:block">
                        {userProfile?.full_name || user?.email}
                    </span>
                    <button
                        onClick={handleSignOut}
                        className="px-4 py-2 border border-gray-200 hover:border-gray-300 text-gray-700 rounded-full transition-all duration-300 flex items-center gap-2 text-sm font-medium"
                    >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                    </button>
                </div>
            </div>
        </nav>
    )
}
