'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, BookOpen, ArrowRight, Loader2, GraduationCap, LogOut, Home, Upload, X, Trash2, MessageSquare, Target, Code2, BarChart2 } from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import HomeFooter from '@/components/HomeFooter'
import { useToast } from '@/components/ToastProvider'

interface Skill {
    id: string
    title: string
    description: string
    created_at: string
}

interface UserProfile {
    full_name: string | null
    avatar_url: string | null
}

export default function Dashboard() {
    const [skills, setSkills] = useState<Skill[]>([])
    const [loading, setLoading] = useState(true)
    const [user, setUser] = useState<any>(null)
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
    const [isCreating, setIsCreating] = useState(false)
    const [newSkillTitle, setNewSkillTitle] = useState('')
    const [newSkillDesc, setNewSkillDesc] = useState('')
    const [skillCategory, setSkillCategory] = useState<string>('technical')
    const [showDocumentPrompt, setShowDocumentPrompt] = useState(false)
    const [createdSkillId, setCreatedSkillId] = useState<string | null>(null)
    const [uploadingDocs, setUploadingDocs] = useState(false)
    const [generatingRoadmap, setGeneratingRoadmap] = useState(false)
    const [deletingSkillId, setDeletingSkillId] = useState<string | null>(null)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [skillToDelete, setSkillToDelete] = useState<Skill | null>(null)
    const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const supabase = createClient()
    const router = useRouter()
    const toast = useToast()

    // Skill categories with emojis
    const categories = [
        { id: 'technical', label: 'Technical', emoji: '💻' },
        { id: 'creative', label: 'Creative', emoji: '🎨' },
        { id: 'business', label: 'Business', emoji: '💼' },
        { id: 'marketing', label: 'Marketing', emoji: '📈' },
        { id: 'design', label: 'Design', emoji: '🎭' },
        { id: 'language', label: 'Language', emoji: '🌍' },
        { id: 'science', label: 'Science', emoji: '🔬' },
        { id: 'mathematics', label: 'Mathematics', emoji: '📐' },
        { id: 'health', label: 'Health & Fitness', emoji: '💪' },
        { id: 'music', label: 'Music', emoji: '🎵' },
        { id: 'finance', label: 'Finance', emoji: '💰' },
        { id: 'other', label: 'Other', emoji: '📚' },
    ]

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
            } else {
                setUser(user)
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('full_name, avatar_url')
                    .eq('id', user.id)
                    .single()

                if (profile) {
                    setUserProfile(profile)
                }

                fetchSkills(user.id)
            }
        }
        getUser()
    }, [router, supabase])

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isCreating) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = 'unset'
        }
        return () => {
            document.body.style.overflow = 'unset'
        }
    }, [isCreating])

    const fetchSkills = async (userId: string) => {
        const { data, error } = await supabase
            .from('skills')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

        if (data) setSkills(data)
        setLoading(false)
    }

    const handleCreateSkill = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user) return

        const { data, error } = await supabase
            .from('skills')
            .insert([
                {
                    user_id: user.id,
                    title: newSkillTitle,
                    description: newSkillDesc,
                    category: skillCategory,
                    is_technical: skillCategory === 'technical'
                }
            ])
            .select()

        if (data) {
            setSkills([data[0], ...skills])
            setCreatedSkillId(data[0].id)
            setIsCreating(false)
            setShowDocumentPrompt(true) // Show document upload prompt
            setNewSkillTitle('')
            setNewSkillDesc('')
            setSkillCategory('technical')
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0 || !createdSkillId) return

        setUploadingDocs(true)
        const uploadedDocIds: string[] = []

        try {
            for (const file of Array.from(files)) {
                const formData = new FormData()
                formData.append('file', file)
                formData.append('skill_id', createdSkillId)
                formData.append('user_id', user!.id)

                const response = await fetch('http://localhost:8000/documents/upload', {
                    method: 'POST',
                    body: formData
                })

                if (response.ok) {
                    const data = await response.json()
                    uploadedDocIds.push(data.document_id)
                }
            }

            // Generate roadmap with document context
            await generateRoadmap(uploadedDocIds)
        } catch (error) {
            console.error('Upload error:', error)
            // Generate roadmap anyway
            await generateRoadmap([])
        } finally {
            setUploadingDocs(false)
        }
    }

    const generateRoadmap = async (documentIds: string[] = []) => {
        if (!createdSkillId) return

        setGeneratingRoadmap(true)
        try {
            console.log('Generating roadmap for skill:', createdSkillId, 'with documents:', documentIds)

            const response = await fetch('http://localhost:8000/roadmap/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    skill_id: createdSkillId,
                    document_ids: documentIds
                })
            })

            const data = await response.json()

            if (response.ok) {
                console.log('Roadmap generated successfully')
                toast.success('Roadmap generated successfully!')
                // Navigate to roadmap page
                router.push(`/skills/${createdSkillId}/roadmap`)
            } else {
                console.error('Roadmap generation failed:', data)
                toast.error(`Failed to generate roadmap: ${data.detail || 'Unknown error'}`)
                // Navigate anyway so user can try again from roadmap page
                router.push(`/skills/${createdSkillId}/roadmap`)
            }
        } catch (error) {
            console.error('Roadmap generation error:', error)
            toast.error('Failed to generate roadmap. You can try generating it from the roadmap page.')
            // Navigate anyway so user can try again from roadmap page
            router.push(`/skills/${createdSkillId}/roadmap`)
        } finally {
            setGeneratingRoadmap(false)
            setShowDocumentPrompt(false)
            setCreatedSkillId(null)
        }
    }

    const handleDeleteClick = (skill: Skill, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setSkillToDelete(skill)
        setShowDeleteConfirm(true)
    }

    const handleDeleteConfirm = async () => {
        if (!skillToDelete) return

        const skillTitle = skillToDelete.title
        setDeletingSkillId(skillToDelete.id)
        try {
            const response = await fetch(`http://localhost:8000/skills/${skillToDelete.id}`, {
                method: 'DELETE'
            })

            if (response.ok) {
                // Remove from UI state
                setSkills(skills.filter(s => s.id !== skillToDelete.id))
                setShowDeleteConfirm(false)
                setSkillToDelete(null)

                // Show success message
                setDeleteSuccess(skillTitle)
                setTimeout(() => setDeleteSuccess(null), 3000)
            } else {
                const error = await response.json()
                toast.error(`Failed to delete skill: ${error.detail || 'Unknown error'}`)
            }
        } catch (error) {
            console.error('Delete error:', error)
            toast.error('Failed to delete skill. Please try again.')
        } finally {
            setDeletingSkillId(null)
        }
    }

    const handleDeleteCancel = () => {
        setShowDeleteConfirm(false)
        setSkillToDelete(null)
    }

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-white">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            </div>
        )
    }

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-purple-50 via-white to-pink-50">

            {/* Custom Cursor Styles */}
            <style jsx global>{`
                * {
                    cursor: default !important;
                }
                a, button, [role="button"] {
                    cursor: pointer !important;
                }
                input, textarea, select {
                    cursor: text !important;
                }
            `}</style>

            {/* Simplified Gradient Blobs - No expensive blur */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-30" style={{ zIndex: 0 }}>
                <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-gradient-to-br from-purple-400 via-pink-300 to-orange-300 rounded-full"></div>
                <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-indigo-400 via-purple-300 to-pink-300 rounded-full"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-gradient-to-br from-purple-200 via-pink-200 to-orange-200 rounded-full"></div>
                <div className="absolute bottom-20 right-20 w-[300px] h-[300px] bg-gradient-to-br from-pink-300 via-purple-200 to-indigo-200 rounded-full"></div>
            </div>

            {/* Navigation Bar */}
            <nav className="relative" style={{ zIndex: 10 }}>
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

            <div className="max-w-7xl mx-auto px-6 py-6 relative z-10">
                <header className="mb-12">
                    <motion.h1
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-5xl md:text-6xl font-bold text-gray-900 mb-4"
                    >
                        Your Learning Dashboard
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="text-lg text-gray-600 mb-10"
                    >
                        Manage your learning journey in one place
                    </motion.p>

                    {/* Feature Cards */}
                    <div className="grid md:grid-cols-2 gap-6 mb-8">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 }}
                            className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-100 hover:border-purple-200 hover:shadow-lg transition-all duration-300"
                        >
                            <div className="flex items-start gap-4">
                                <div className="bg-purple-100 p-3 rounded-xl">
                                    <Plus className="h-6 w-6 text-purple-600" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">Create New Skills</h3>
                                    <p className="text-gray-600 text-sm leading-relaxed">
                                        Start a new learning path on any topic. Our AI will guide you with personalized lessons, quizzes, and challenges.
                                    </p>
                                    <button
                                        onClick={() => setIsCreating(true)}
                                        className="mt-4 text-purple-600 hover:text-purple-700 font-semibold text-sm flex items-center gap-2 group"
                                    >
                                        Create Skill
                                        <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                    </button>
                                </div>
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.4 }}
                            className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-100 hover:border-pink-200 hover:shadow-lg transition-all duration-300"
                        >
                            <div className="flex items-start gap-4">
                                <div className="bg-pink-100 p-3 rounded-xl">
                                    <BookOpen className="h-6 w-6 text-pink-600" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">Your Created Skills</h3>
                                    <p className="text-gray-600 text-sm leading-relaxed">
                                        View all your learning paths below. Track your progress, continue where you left off, and master new skills.
                                    </p>
                                    <div className="mt-4 text-pink-600 font-semibold text-sm flex items-center gap-2">
                                        {skills.length} {skills.length === 1 ? 'Skill' : 'Skills'} Created
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </header>

                {/* Create Skill Modal */}
                {isCreating && (
                    <div
                        className="fixed inset-0 bg-black/20 z-[100] backdrop-blur-sm overflow-y-auto"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) {
                                setIsCreating(false)
                            }
                        }}
                    >
                        <div className="min-h-screen flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full max-w-2xl p-6 bg-white rounded-3xl shadow-2xl border border-gray-100"
                            >
                                <h2 className="text-2xl font-bold mb-6 text-gray-900">Create New Skill Path</h2>
                                <form onSubmit={handleCreateSkill} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all placeholder:text-gray-400 text-sm"
                                            placeholder="e.g. Quantum Physics"
                                            value={newSkillTitle}
                                            onChange={(e) => setNewSkillTitle(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                                        <textarea
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all placeholder:text-gray-400 resize-none text-sm"
                                            placeholder="What is your objective?"
                                            rows={3}
                                            value={newSkillDesc}
                                            onChange={(e) => setNewSkillDesc(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-2">Skill Category</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {categories.map((category) => (
                                                <button
                                                    key={category.id}
                                                    type="button"
                                                    onClick={() => setSkillCategory(category.id)}
                                                    className={`px-2 py-1.5 rounded-full border transition-all duration-300 font-medium text-xs ${skillCategory === category.id
                                                        ? 'bg-gray-900 text-white border-gray-900 shadow-lg'
                                                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:shadow-md'
                                                        }`}
                                                >
                                                    <span className="mr-1">{category.emoji}</span>
                                                    {category.label}
                                                </button>
                                            ))}
                                        </div>
                                        {
                                            skillCategory === 'technical' && (
                                                <p className="mt-3 text-xs text-orange-600 bg-orange-50 p-2 rounded-lg border border-orange-100">
                                                    ✨ Coding challenges will be enabled for this skill
                                                </p>
                                            )
                                        }
                                    </div >
                                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                                        <button
                                            type="button"
                                            onClick={() => setIsCreating(false)}
                                            className="px-4 py-2 text-gray-500 hover:text-gray-800 transition-colors font-medium text-sm"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 px-6 py-2 rounded-xl font-bold text-white shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all text-sm"
                                        >
                                            Create Path
                                        </button>
                                    </div>
                                </form >
                            </motion.div >
                        </div >
                    </div >
                )
                }

                {/* Skills Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {skills.map((skill, index) => (
                        <motion.div
                            key={skill.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(index * 0.03, 0.2), duration: 0.2 }}
                        >
                            <div className="group h-full min-h-[320px] flex flex-col justify-between p-6 rounded-2xl border-2 border-gray-200 bg-white/80 hover:border-purple-300 hover:shadow-xl transition-all duration-300 relative">
                                {/* Delete Button - always visible but subtle */}
                                <button
                                    onClick={(e) => handleDeleteClick(skill, e)}
                                    disabled={deletingSkillId === skill.id}
                                    className="absolute top-3 right-3 p-2 rounded-lg bg-white border border-gray-200 hover:bg-red-50 hover:border-red-300 transition-all duration-200 z-10 shadow-sm"
                                    title="Delete skill"
                                >
                                    {deletingSkillId === skill.id ? (
                                        <Loader2 className="h-4 w-4 text-red-500 animate-spin" />
                                    ) : (
                                        <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                                    )}
                                </button>

                                <div>
                                    <div className="flex items-start mb-6">
                                        <div className="p-3 bg-purple-100 rounded-xl border border-purple-200 shadow-sm">
                                            <BookOpen className="h-6 w-6 text-purple-600" />
                                        </div>
                                    </div>
                                    <h3 className="text-2xl font-bold mb-2 text-gray-900">
                                        {skill.title}
                                    </h3>
                                    <p className="text-gray-600 text-sm line-clamp-2 leading-relaxed">
                                        {skill.description || 'No description provided.'}
                                    </p>
                                </div>

                                {/* Action Buttons */}
                                <div className="mt-6 pt-4 border-t border-gray-100 grid grid-cols-2 gap-2">
                                    <Link href={`/skills/${skill.id}`}>
                                        <button className="w-full px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium border border-purple-200 hover:border-purple-300">
                                            <MessageSquare className="h-4 w-4" />
                                            Study
                                        </button>
                                    </Link>
                                    <Link href={`/skills/${skill.id}/roadmap`}>
                                        <button className="w-full px-3 py-2 bg-pink-50 hover:bg-pink-100 text-pink-700 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium border border-pink-200 hover:border-pink-300">
                                            <Target className="h-4 w-4" />
                                            Roadmap
                                        </button>
                                    </Link>
                                    <Link href={`/skills/${skill.id}/analytics`}>
                                        <button className="w-full px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium border border-blue-200 hover:border-blue-300">
                                            <BarChart2 className="h-4 w-4" />
                                            Stats
                                        </button>
                                    </Link>
                                    <Link href={`/skills/${skill.id}/quiz`}>
                                        <button className="w-full px-3 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium border border-orange-200 hover:border-orange-300">
                                            <BookOpen className="h-4 w-4" />
                                            Quizzes
                                        </button>
                                    </Link>
                                    {(skill as any).is_technical && (
                                        <Link href={`/skills/${skill.id}/coding`}>
                                            <button className="w-full px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium border border-indigo-200 hover:border-indigo-300">
                                                <Code2 className="h-4 w-4" />
                                                Challenges
                                            </button>
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    ))}

                    {skills.length === 0 && !loading && (
                        <div className="col-span-full text-center py-32 relative">
                            <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                                <div className="w-96 h-96 bg-purple-100 rounded-full blur-[100px]" />
                            </div>
                            <div className="inline-block p-16 max-w-2xl mx-auto relative z-10 bg-white/80 rounded-3xl border border-gray-100 shadow-xl">
                                <h3 className="text-3xl font-bold text-gray-900 mb-4">Start Your Learning Journey</h3>
                                <p className="text-gray-600 text-lg mb-8">Create your first skill path and let AI guide you to mastery.</p>
                                <button
                                    onClick={() => setIsCreating(true)}
                                    className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-full font-bold hover:scale-105 transform duration-200 shadow-lg"
                                >
                                    Create First Skill →
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div >

            {/* Document Upload Prompt Modal */}
            {
                showDocumentPrompt && (
                    <div className="fixed inset-0 bg-black/20 z-[100] backdrop-blur-sm flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="w-full max-w-md p-6 bg-white rounded-3xl shadow-2xl border border-gray-200"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold text-gray-900">Upload Learning Materials?</h2>
                                <button
                                    onClick={() => {
                                        setShowDocumentPrompt(false)
                                        generateRoadmap([])
                                    }}
                                    className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <X className="h-5 w-5 text-gray-500" />
                                </button>
                            </div>

                            <p className="text-sm text-gray-600 mb-6">
                                Upload PDFs, notes, or textbooks to get a more personalized learning roadmap based on your materials.
                            </p>

                            {generatingRoadmap ? (
                                <div className="flex flex-col items-center justify-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-purple-600 mb-4" />
                                    <p className="text-sm text-gray-600 font-medium">Generating your personalized roadmap...</p>
                                    <p className="text-xs text-gray-400 mt-1">This may take a few moments</p>
                                </div>
                            ) : uploadingDocs ? (
                                <div className="flex flex-col items-center justify-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-purple-600 mb-4" />
                                    <p className="text-sm text-gray-600 font-medium">Uploading documents...</p>
                                </div>
                            ) : (
                                <>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileUpload}
                                        accept=".pdf,.txt,.md"
                                        multiple
                                        className="hidden"
                                    />

                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full mb-3 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white py-3 px-4 rounded-xl transition-all shadow-lg hover:shadow-xl font-medium"
                                    >
                                        <Upload className="h-4 w-4" />
                                        Upload Documents & Generate Roadmap
                                    </button>

                                    <button
                                        onClick={() => generateRoadmap([])}
                                        className="w-full text-gray-500 hover:text-gray-700 py-2 text-sm font-medium transition-colors"
                                    >
                                        Skip for Now →
                                    </button>
                                </>
                            )}
                        </motion.div>
                    </div>
                )
            }

            {/* Delete Confirmation Modal */}
            {
                showDeleteConfirm && skillToDelete && (
                    <div className="fixed inset-0 bg-black/20 z-[100] backdrop-blur-sm flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="w-full max-w-md p-6 bg-white rounded-3xl shadow-2xl border border-gray-200"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold text-gray-900">Delete Skill?</h2>
                                <button
                                    onClick={handleDeleteCancel}
                                    className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <X className="h-5 w-5 text-gray-500" />
                                </button>
                            </div>

                            <div className="mb-6">
                                <p className="text-sm text-gray-600 mb-3">
                                    Are you sure you want to delete <span className="font-semibold text-gray-900">{skillToDelete.title}</span>?
                                </p>
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                    <p className="text-xs text-red-800 font-medium mb-1">⚠️ This action cannot be undone</p>
                                    <p className="text-xs text-red-600">
                                        All related data will be permanently deleted:
                                    </p>
                                    <ul className="text-xs text-red-600 mt-2 ml-4 list-disc space-y-0.5">
                                        <li>Documents and materials</li>
                                        <li>Chat history</li>
                                        <li>Quizzes and progress</li>
                                        <li>Coding challenges</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleDeleteCancel}
                                    className="flex-1 px-4 py-2.5 border border-gray-200 hover:border-gray-300 text-gray-700 rounded-xl transition-all font-medium text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteConfirm}
                                    disabled={deletingSkillId !== null}
                                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-xl transition-all font-medium text-sm flex items-center justify-center gap-2"
                                >
                                    {deletingSkillId ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Deleting...
                                        </>
                                    ) : (
                                        <>
                                            <Trash2 className="h-4 w-4" />
                                            Delete
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )
            }

            {/* Success Toast Notification */}
            {
                deleteSuccess && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        className="fixed bottom-6 right-6 z-[101] bg-green-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 border border-green-500"
                    >
                        <div className="flex items-center justify-center w-8 h-8 bg-white/20 rounded-full">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <div>
                            <p className="font-semibold">Skill Deleted Successfully</p>
                            <p className="text-sm text-green-100">"{deleteSuccess}" has been removed</p>
                        </div>
                    </motion.div>
                )
            }

            <HomeFooter />
        </div >
    )
}
