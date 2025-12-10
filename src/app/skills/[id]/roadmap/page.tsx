'use client'

import { useEffect, useState, useCallback, memo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { ChevronLeft, Loader2, Sparkles, Upload, FileText, Trash2, MapPin, MessageCircle, Lightbulb, Target, BookOpen, CheckCircle2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import DashboardHeader from '@/components/DashboardHeader'
import HomeFooter from '@/components/HomeFooter'
import { useToast } from '@/components/ToastProvider'

interface Document {
    id: string
    filename: string
    processed: boolean
    status: string
    created_at: string
}

// Memoized document item
const DocumentItem = memo(({ doc, isSelected, onToggle, onDelete }: any) => (
    <div
        className={`p-3 rounded-lg border transition-colors cursor-pointer ${isSelected
            ? 'bg-purple-50 border-purple-300'
            : 'bg-white border-gray-200 hover:border-purple-200'
            }`}
        onClick={() => onToggle(doc.id)}
    >
        <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-purple-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{doc.filename}</p>
                <div className="text-xs text-gray-400 flex items-center mt-1">
                    {doc.status === 'ready' || doc.processed ? (
                        <span className="text-green-600 flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            Ready
                        </span>
                    ) : (
                        <span className="text-yellow-600 flex items-center">
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Processing
                        </span>
                    )}
                </div>
            </div>
            <button
                onClick={(e) => {
                    e.stopPropagation()
                    onDelete(doc.id)
                }}
                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
            >
                <Trash2 className="h-4 w-4" />
            </button>
        </div>
    </div>
))

DocumentItem.displayName = 'DocumentItem'

// Parse roadmap into structured sections
function parseRoadmap(markdown: string) {
    const lines = markdown.split('\n')
    const sections: any[] = []
    let currentSection: any = null
    let currentPhase: any = null

    lines.forEach(line => {
        // Main heading (# )
        if (line.startsWith('# ')) {
            if (currentSection) sections.push(currentSection)
            currentSection = {
                title: line.replace('# ', '').trim(),
                type: 'main',
                content: [],
                phases: []
            }
        }
        // Phase heading (## )
        else if (line.startsWith('## ')) {
            if (currentPhase) currentSection?.phases.push(currentPhase)
            currentPhase = {
                title: line.replace('## ', '').trim(),
                topics: [],
                items: []
            }
        }
        // Topic (### )
        else if (line.startsWith('### ')) {
            currentPhase?.topics.push(line.replace('### ', '').trim())
        }
        // List items
        else if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
            const item = line.trim().replace(/^[*-]\s+/, '')
            if (item) currentPhase?.items.push(item)
        }
        // Regular content
        else if (line.trim() && currentSection) {
            currentSection.content.push(line.trim())
        }
    })

    if (currentPhase) currentSection?.phases.push(currentPhase)
    if (currentSection) sections.push(currentSection)

    return sections
}

export default function RoadmapPage() {
    const params = useParams()
    const router = useRouter()
    const id = params.id as string
    const supabase = createClient()

    const [skill, setSkill] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [documents, setDocuments] = useState<Document[]>([])
    const [uploading, setUploading] = useState(false)
    const [selectedDocs, setSelectedDocs] = useState<string[]>([])
    const toast = useToast()

    const fetchData = useCallback(async () => {
        const { data: skillData } = await supabase
            .from('skills')
            .select('*')
            .eq('id', id)
            .single()

        if (skillData) setSkill(skillData)

        const { data: docsData } = await supabase
            .from('documents')
            .select('*')
            .eq('skill_id', id)
            .order('created_at', { ascending: false })

        if (docsData) setDocuments(docsData)
        setLoading(false)
    }, [id, supabase])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const handleGenerateRoadmap = async () => {
        setGenerating(true)
        try {
            console.log('Generating roadmap for skill:', id, 'with selected documents:', selectedDocs)

            const response = await fetch('http://localhost:8000/roadmap/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    skill_id: id,
                    document_ids: selectedDocs
                })
            })

            const data = await response.json()

            if (response.ok) {
                console.log('Roadmap generated successfully')
                setSkill({ ...skill, roadmap: data.roadmap, roadmap_svg: data.roadmap_svg })
                toast.success('Roadmap generated successfully!')
            } else {
                console.error('Roadmap generation failed:', data)
                toast.error(`Failed to generate roadmap: ${data.detail || 'Unknown error'}. Please try again.`)
            }
        } catch (error) {
            console.error('Roadmap generation error:', error)
            toast.error('Failed to generate roadmap. Please check your connection and try again.')
        } finally {
            setGenerating(false)
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const formData = new FormData()
            formData.append('file', file)
            formData.append('skill_id', id)
            formData.append('user_id', user.id)

            const response = await fetch('http://localhost:8000/documents/upload', {
                method: 'POST',
                body: formData
            })

            if (response.ok) {
                // Immediately fetch to show the new document
                await fetchData()
                toast.success('Document uploaded successfully!')

                // Poll for status updates every 3 seconds for up to 30 seconds
                let pollCount = 0
                const pollInterval = setInterval(async () => {
                    pollCount++
                    await fetchData()

                    // Stop polling after 30 seconds
                    if (pollCount >= 10) {
                        clearInterval(pollInterval)
                    }
                }, 3000)
            }
        } catch (error) {
            console.error('Upload error:', error)
            toast.error('Failed to upload document')
        } finally {
            setUploading(false)
        }
    }

    const handleDeleteDocument = useCallback(async (docId: string) => {
        if (!confirm('Delete this document?')) return

        try {
            const res = await fetch(`http://localhost:8000/documents/${docId}`, { method: 'DELETE' })
            if (res.ok) {
                setDocuments(prev => prev.filter(d => d.id !== docId))
                setSelectedDocs(prev => prev.filter(id => id !== docId))
            }
        } catch (error) {
            console.error(error)
        }
    }, [])

    const toggleDocSelection = useCallback((docId: string) => {
        setSelectedDocs(prev =>
            prev.includes(docId)
                ? prev.filter(id => id !== docId)
                : [...prev, docId]
        )
    }, [])

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            </div>
        )
    }

    const parsedRoadmap = skill?.roadmap ? parseRoadmap(skill.roadmap) : []

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-purple-50 via-white to-pink-50 relative overflow-hidden">
            {/* Decorative Gradient Blobs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
                <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-gradient-to-br from-purple-400 via-pink-300 to-orange-300 rounded-full"></div>
                <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-indigo-400 via-purple-300 to-pink-300 rounded-full"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-gradient-to-br from-purple-200 via-pink-200 to-orange-200 rounded-full"></div>
            </div>

            <DashboardHeader />
            <div className="max-w-7xl mx-auto p-8 relative z-10 w-full flex-1">
                {/* Header */}
                <div className="mb-8">
                    <Link href="/dashboard">
                        <button className="inline-flex items-center px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors group bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow">
                            <ChevronLeft className="h-4 w-4 mr-2 group-hover:-translate-x-0.5 transition-transform" />
                            Back to Dashboard
                        </button>
                    </Link>

                    <div className="mt-6 flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                                    <MapPin className="h-6 w-6 text-white" />
                                </div>
                                <div>
                                    <h1 className="text-4xl font-bold text-gray-900">{skill?.title}</h1>
                                    <p className="text-gray-600">Learning Roadmap</p>
                                </div>
                            </div>
                        </div>

                        {/* AI Assistant Modes */}
                        <div className="flex gap-2">
                            <Link href={`/skills/${id}?mode=explain&message=${encodeURIComponent(`Explain ${skill?.title} to me in detail. Break down the key concepts and help me understand the fundamentals.`)}`}>
                                <button className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors flex items-center gap-2 text-sm font-medium">
                                    <BookOpen className="h-4 w-4" />
                                    EXPLAIN
                                </button>
                            </Link>
                            <Link href={`/skills/${id}?mode=coach&message=${encodeURIComponent(`I need coaching on ${skill?.title}. Help me practice and improve my skills through guided exercises.`)}`}>
                                <button className="px-4 py-2 bg-green-50 text-green-600 rounded-lg border border-green-200 hover:bg-green-100 transition-colors flex items-center gap-2 text-sm font-medium">
                                    <MessageCircle className="h-4 w-4" />
                                    COACH
                                </button>
                            </Link>
                            <Link href={`/skills/${id}?mode=plan&message=${encodeURIComponent(`Create a detailed learning plan for ${skill?.title}. What should I focus on and in what order?`)}`}>
                                <button className="px-4 py-2 bg-purple-50 text-purple-600 rounded-lg border border-purple-200 hover:bg-purple-100 transition-colors flex items-center gap-2 text-sm font-medium">
                                    <Target className="h-4 w-4" />
                                    PLAN
                                </button>
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Roadmap Area */}
                    <div className="lg:col-span-2 space-y-6">
                        {skill?.roadmap ? (
                            <>
                                {parsedRoadmap.map((section, idx) => (
                                    <div key={idx} className="space-y-4">
                                        {/* Section Header */}
                                        {section.title && (
                                            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm mb-8">
                                                <div className="border-l-4 border-purple-500 pl-6">
                                                    <h2 className="text-3xl font-bold text-gray-900 mb-4">{section.title}</h2>
                                                    {section.content.length > 0 && (
                                                        <div className="mt-3 text-gray-700 prose max-w-none">
                                                            <ReactMarkdown
                                                                components={{
                                                                    p: ({ node, ...props }) => <p className="mb-3 leading-relaxed text-base" {...props} />,
                                                                    strong: ({ node, ...props }) => <strong className="font-semibold text-gray-900" {...props} />,
                                                                    ul: ({ node, ...props }) => <ul className="list-disc list-inside space-y-2 ml-2" {...props} />,
                                                                    li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />
                                                                }}
                                                            >
                                                                {section.content.join('\n\n')}
                                                            </ReactMarkdown>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Phases */}
                                        {section.phases
                                            .filter((phase: any) => phase.items.length > 0 || phase.topics.length > 0) // Hide empty phases
                                            .map((phase: any, phaseIdx: number) => {
                                                // Extract phase number from title if it exists (e.g., "Phase 1: Foundation")
                                                const phaseMatch = phase.title.match(/Phase\s+(\d+)/i)
                                                const phaseNumber = phaseMatch ? phaseMatch[1] : null
                                                const phaseTitle = phase.title.replace(/Phase\s+\d+:\s*/i, '').trim()

                                                return (
                                                    <div key={phaseIdx} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden mb-6">
                                                        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                                                            <div className="flex items-center justify-between">
                                                                <h3 className="text-xl font-bold text-gray-900">{phaseTitle || phase.title}</h3>
                                                                {phaseNumber && (
                                                                    <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                                                                        Phase {phaseNumber}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="p-8">
                                                            {/* Topics */}
                                                            {phase.topics.length > 0 && (
                                                                <div className="mb-5 flex flex-wrap gap-2">
                                                                    {phase.topics.map((topic: string, topicIdx: number) => (
                                                                        <span key={topicIdx} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium border border-gray-200">
                                                                            {topic}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {/* Items */}
                                                            {phase.items.length > 0 && (
                                                                <ul className="space-y-2.5 mb-6">
                                                                    {phase.items.map((item: string, itemIdx: number) => (
                                                                        <li key={itemIdx} className="flex items-start gap-3 text-gray-700 text-base">
                                                                            <CheckCircle2 className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
                                                                            <span className="leading-relaxed">{item}</span>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            )}

                                                            {/* Action Buttons - Enhanced */}
                                                            <div className="mt-5 pt-5 border-t border-gray-200 grid grid-cols-2 gap-3">
                                                                <Link href={`/skills/${id}?mode=explain&message=${encodeURIComponent(`Teach me about "${phase.title}". Explain the key concepts and help me understand this topic in detail.`)}`} className="group">
                                                                    <button className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors duration-200 text-sm font-semibold flex items-center justify-center gap-2">
                                                                        <Lightbulb className="h-4 w-4" />
                                                                        Learn This
                                                                    </button>
                                                                </Link>
                                                                <Link href={`/skills/${id}?mode=coach&message=${encodeURIComponent(`I need coaching on "${phase.title}". Guide me through practical exercises and help me master this topic.`)}`} className="group">
                                                                    <button className="w-full px-4 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors duration-200 text-sm font-semibold flex items-center justify-center gap-2">
                                                                        <MessageCircle className="h-4 w-4" />
                                                                        Get Coached
                                                                    </button>
                                                                </Link>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                    </div>
                                ))}

                                {/* Regenerate Button */}
                                <div className="bg-gradient-to-br from-white to-purple-50/50 rounded-2xl border-2 border-purple-200 shadow-xl p-8">
                                    <div className="text-center mb-4">
                                        <h3 className="text-lg font-bold text-gray-900 mb-2">Want a Fresh Perspective?</h3>
                                        <p className="text-sm text-gray-600">Generate a new roadmap with updated insights</p>
                                    </div>
                                    <button
                                        onClick={handleGenerateRoadmap}
                                        disabled={generating}
                                        className="w-full bg-gradient-to-r from-purple-400 to-pink-400 hover:from-purple-500 hover:to-pink-500 text-white py-4 px-8 rounded-xl font-bold transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center justify-center gap-3 hover:scale-[1.02]"
                                    >
                                        {generating ? (
                                            <>
                                                <Loader2 className="h-6 w-6 animate-spin" />
                                                Regenerating...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="h-6 w-6" />
                                                Regenerate Roadmap
                                            </>
                                        )}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="bg-gradient-to-br from-white via-purple-50/30 to-pink-50/30 rounded-3xl border-2 border-purple-200 shadow-2xl p-16 text-center relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-purple-100/20 to-pink-100/20"></div>
                                <div className="relative z-10">
                                    <div className="w-32 h-32 mx-auto mb-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-2xl">
                                        <MapPin className="h-16 w-16 text-white drop-shadow-lg" />
                                    </div>
                                    <h2 className="text-3xl font-bold text-gray-900 mb-4">No Roadmap Yet</h2>
                                    <p className="text-gray-600 mb-10 max-w-md mx-auto text-lg leading-relaxed">
                                        Generate a personalized learning roadmap tailored to your goals.
                                        Upload documents for context to make it even more relevant!
                                    </p>
                                    <button
                                        onClick={handleGenerateRoadmap}
                                        disabled={generating}
                                        className="bg-gradient-to-r from-purple-400 to-pink-400 hover:from-purple-500 hover:to-pink-500 text-white py-5 px-10 rounded-xl font-bold transition-all duration-300 shadow-xl hover:shadow-2xl disabled:opacity-50 inline-flex items-center gap-3 hover:scale-105"
                                    >
                                        {generating ? (
                                            <>
                                                <Loader2 className="h-6 w-6 animate-spin" />
                                                Generating Your Roadmap...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="h-6 w-6" />
                                                Generate Roadmap
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sidebar - Documents */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-6 sticky top-8">
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Context Documents</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Upload documents to personalize your roadmap.
                            </p>

                            {/* Upload Button */}
                            <label className="block mb-6">
                                <input
                                    type="file"
                                    accept=".pdf,.txt,.md"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                    disabled={uploading}
                                />
                                <div className="w-full bg-purple-50 hover:bg-purple-100 text-purple-600 border-2 border-dashed border-purple-300 py-3 px-4 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2">
                                    {uploading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Uploading...
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="h-4 w-4" />
                                            Upload Document
                                        </>
                                    )}
                                </div>
                            </label>

                            {/* Documents List */}
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {documents.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400 text-sm">
                                        No documents uploaded yet
                                    </div>
                                ) : (
                                    documents.map((doc) => (
                                        <DocumentItem
                                            key={doc.id}
                                            doc={doc}
                                            isSelected={selectedDocs.includes(doc.id)}
                                            onToggle={toggleDocSelection}
                                            onDelete={handleDeleteDocument}
                                        />
                                    ))
                                )}
                            </div>

                            {selectedDocs.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-gray-200">
                                    <p className="text-xs text-gray-600">
                                        {selectedDocs.length} document{selectedDocs.length !== 1 ? 's' : ''} selected
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <HomeFooter />
        </div>
    )
}

