'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import {
    Send, Loader2, FileText, Trash2, PaperclipIcon as Paperclip,
    Bot, User, Command, CheckCircle, XCircle, AlertCircle, Target, ChevronLeft
} from 'lucide-react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { motion } from 'framer-motion'
import { useToast } from '@/components/ToastProvider'
import { api, errorMessage } from '@/lib/api/client'
import { MENTOR_MODES, isMentorMode, type MentorMode, type MessageSource } from '@/lib/api/types'
import { DOCUMENT_ACCEPT, documentState, isDocumentInProgress, type SkillDocument } from '@/lib/documents'

interface QuizQuestion {
    question: string
    options: string[]
    correct_answer: number
}

interface Message {
    role: 'user' | 'assistant'
    content: string
    sources?: MessageSource[]
    mode?: MentorMode
}

function parseQuiz(content: string): QuizQuestion[] | null {
    try {
        const parsed: unknown = JSON.parse(content)
        const questions = (parsed as { questions?: unknown } | null)?.questions
        return Array.isArray(questions) ? (questions as QuizQuestion[]) : null
    } catch {
        return null
    }
}

// Memoized Quiz Renderer Component.
// Practice quizzes inside the chat are not saved; scored attempts live on the quiz page.
const QuizRenderer = React.memo(({ content }: { content: string }) => {
    const [quizData] = useState<QuizQuestion[] | null>(() => parseQuiz(content))
    const [userAnswers, setUserAnswers] = useState<number[]>(() =>
        new Array(quizData?.length ?? 0).fill(-1)
    )
    const [submitted, setSubmitted] = useState(false)
    const [score, setScore] = useState(0)

    const handleAnswerSelect = (questionIndex: number, optionIndex: number) => {
        if (submitted) return
        const newAnswers = [...userAnswers]
        newAnswers[questionIndex] = optionIndex
        setUserAnswers(newAnswers)
    }

    const handleSubmit = () => {
        if (!quizData) return
        let correctCount = 0
        quizData.forEach((q, idx) => {
            if (userAnswers[idx] === q.correct_answer) correctCount++
        })
        setScore(correctCount)
        setSubmitted(true)
    }

    if (!quizData) return null

    return (
        <div className="space-y-6 bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-2xl border border-purple-100 shadow-lg">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-purple-900 flex items-center">
                    <Target className="h-5 w-5 mr-2 text-purple-600" />
                    Practice Quiz
                </h3>
                {submitted && (
                    <div className="bg-white px-4 py-2 rounded-full shadow-md">
                        <span className="text-sm font-bold text-purple-600">
                            Score: {score}/{quizData.length}
                        </span>
                    </div>
                )}
            </div>

            {quizData.map((q, qIdx) => (
                <div key={qIdx} className="bg-white p-5 rounded-xl shadow-md border border-gray-100">
                    <p className="font-semibold text-gray-800 mb-4 flex items-start">
                        <span className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center text-sm mr-3 flex-shrink-0 mt-0.5">
                            {qIdx + 1}
                        </span>
                        {q.question}
                    </p>
                    <div className="space-y-2 ml-9">
                        {q.options.map((opt, optIdx) => {
                            const isSelected = userAnswers[qIdx] === optIdx
                            const isCorrect = optIdx === q.correct_answer
                            const showResult = submitted

                            return (
                                <button
                                    key={optIdx}
                                    onClick={() => handleAnswerSelect(qIdx, optIdx)}
                                    disabled={submitted}
                                    className={`w-full text-left p-3 rounded-lg border-2 transition-all flex items-center ${isSelected && !showResult
                                        ? 'border-purple-400 bg-purple-50'
                                        : showResult && isCorrect
                                            ? 'border-green-400 bg-green-50'
                                            : showResult && isSelected && !isCorrect
                                                ? 'border-red-400 bg-red-50'
                                                : 'border-gray-200 hover:border-gray-300 bg-white'
                                        } ${submitted ? 'cursor-default' : 'cursor-pointer'}`}
                                >
                                    <span className="flex-1">{opt}</span>
                                    {showResult && isCorrect && <CheckCircle className="h-5 w-5 text-green-600" />}
                                    {showResult && isSelected && !isCorrect && <XCircle className="h-5 w-5 text-red-600" />}
                                </button>
                            )
                        })}
                    </div>
                </div>
            ))}

            {!submitted && (
                <button
                    onClick={handleSubmit}
                    disabled={userAnswers.some(a => a === -1)}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 px-6 rounded-xl font-semibold hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
                >
                    Submit Quiz
                </button>
            )}
        </div>
    )
})

QuizRenderer.displayName = 'QuizRenderer'
const MemoizedQuizRenderer = QuizRenderer

export default function SkillPage() {
    const params = useParams()
    const id = params.id as string
    const [supabase] = useState(() => createClient())
    const router = useRouter()
    const searchParams = useSearchParams()
    const toast = useToast()

    const [messages, setMessages] = useState<Message[]>([])
    // The roadmap page links here with ?mode=...&message=... to start a conversation.
    // searchParams values are already decoded; decoding again throws on a literal '%'.
    const [input, setInput] = useState(() => searchParams.get('message') ?? '')
    const [sending, setSending] = useState(false)
    const [mode, setMode] = useState<MentorMode>(() => {
        const requested = searchParams.get('mode')
        return isMentorMode(requested) ? requested : 'explain'
    })
    const [chatId, setChatId] = useState<string | null>(null)
    const [documents, setDocuments] = useState<SkillDocument[]>([])
    const [uploading, setUploading] = useState(false)
    const [showCommands, setShowCommands] = useState(false)

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // The prefill has been read into state; drop it from the URL so a reload starts clean
    useEffect(() => {
        if (searchParams.has('message') || searchParams.has('mode')) {
            router.replace(`/skills/${id}`)
        }
    }, [searchParams, id, router])

    const fetchDocuments = useCallback(async () => {
        const { data } = await supabase
            .from('documents')
            .select('id, filename, status, processed, error_message, created_at')
            .eq('skill_id', id)
            .order('created_at', { ascending: false })

        if (data) setDocuments(data)
    }, [id, supabase])

    useEffect(() => {
        fetchDocuments()
    }, [fetchDocuments])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
    }, [messages])

    // While a document is being processed, refresh the list until it finishes.
    const hasUnfinishedDocuments = documents.some(isDocumentInProgress)
    useEffect(() => {
        if (!hasUnfinishedDocuments) return
        const interval = setInterval(fetchDocuments, 4000)
        return () => clearInterval(interval)
    }, [hasUnfinishedDocuments, fetchDocuments])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value
        setInput(value)
        setShowCommands(value.startsWith('/'))
    }

    const selectCommand = (cmd: string) => {
        setInput(cmd + ' ')
        setShowCommands(false)
        setTimeout(() => {
            const form = document.querySelector('form')
            const input = form?.querySelector('input')
            input?.focus()
        }, 0)
    }

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault()
        const userMsg = input.trim()
        if (!userMsg) return

        // Handle commands
        if (userMsg === '/new') {
            setMessages([])
            setChatId(null)
            setInput('')
            return
        }

        if (userMsg === '/delete') {
            if (chatId) {
                await supabase.from('chats').delete().eq('id', chatId)
                setMessages([])
                setChatId(null)
            }
            setInput('')
            return
        }

        setMessages(prev => [...prev, { role: 'user', content: userMsg, mode: mode }])
        setInput('')
        setSending(true)

        try {
            const data = await api.mentor.sendMessage({
                skill_id: id,
                chat_id: chatId,
                message: userMsg,
                mode: mode
            })

            if (!chatId) setChatId(data.chat_id)
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.response,
                sources: data.sources,
                mode: data.mode ?? mode
            }])
        } catch (error) {
            // Shown in the conversation, tagged with the current mode so it is not filtered out
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: errorMessage(error, 'Sorry, I could not get a response. Please try again.'),
                mode: mode
            }])
        } finally {
            setSending(false)
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        try {
            await api.documents.upload(file, id)
            await fetchDocuments()
            toast.success('Document uploaded. Processing it now...')
        } catch (error) {
            toast.error(errorMessage(error, 'Failed to upload document'))
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const processDocument = async (docId: string) => {
        try {
            await api.documents.process(docId)
            await fetchDocuments()
        } catch (error) {
            toast.error(errorMessage(error, 'Failed to process document'))
        }
    }

    const deleteDocument = async (docId: string) => {
        try {
            await api.documents.remove(docId)
            await fetchDocuments()
        } catch (error) {
            toast.error(errorMessage(error, 'Failed to delete document'))
        }
    }

    return (
        <div className="flex h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 relative" data-lenis-prevent>
            {/* Optimized Background - Static gradients only */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-25">
                <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-gradient-to-br from-purple-200 via-pink-200 to-orange-200 rounded-full"></div>
                <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-indigo-200 via-purple-200 to-pink-200 rounded-full"></div>
            </div>

            {/* Sidebar - Documents */}
            <div className="w-80 border-r border-gray-200 bg-white/95 flex flex-col z-20 shadow-lg relative">
                <div className="p-4 border-b border-gray-200">
                    <Link href="/dashboard">
                        <button className="flex items-center text-gray-600 hover:text-gray-900 transition-colors mb-4">
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            <span className="text-sm font-medium">Back to Dashboard</span>
                        </button>
                    </Link>
                    <h2 className="text-lg font-bold text-gray-800 flex items-center">
                        <FileText className="h-5 w-5 mr-2 text-purple-600" />
                        Library
                    </h2>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {documents.length === 0 ? (
                        <div className="text-center text-gray-400 py-8">
                            <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No documents uploaded</p>
                        </div>
                    ) : (
                        documents.map(doc => (
                            <div
                                key={doc.id}
                                className="bg-white border border-gray-200 rounded-xl p-3 hover:shadow-md transition-all group"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-800 truncate">{doc.filename}</p>
                                        <div className="flex items-center mt-1">
                                            {documentState(doc) === 'ready' ? (
                                                <span className="text-xs text-green-600 flex items-center">
                                                    <CheckCircle className="h-3 w-3 mr-1" />
                                                    Ready
                                                </span>
                                            ) : documentState(doc) === 'processing' ? (
                                                <span className="text-xs text-blue-600 flex items-center">
                                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                    Processing
                                                </span>
                                            ) : (
                                                <span className="text-xs flex items-center gap-2">
                                                    <span
                                                        className={`flex items-center ${documentState(doc) === 'failed' ? 'text-red-600' : 'text-yellow-600'}`}
                                                        title={doc.error_message ?? undefined}
                                                    >
                                                        <AlertCircle className="h-3 w-3 mr-1" />
                                                        {documentState(doc) === 'failed' ? 'Failed' : 'Not processed'}
                                                    </span>
                                                    <button
                                                        onClick={() => processDocument(doc.id)}
                                                        className="text-purple-600 hover:text-purple-800 font-medium underline"
                                                    >
                                                        {documentState(doc) === 'failed' ? 'Retry' : 'Process'}
                                                    </button>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => deleteDocument(doc.id)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 p-1"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-4 border-t border-gray-200 bg-white sticky bottom-0">
                    <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileUpload}
                        className="hidden"
                        accept={DOCUMENT_ACCEPT}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="w-full flex items-center justify-center bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white py-3 px-4 rounded-xl transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
                    >
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4 mr-2" />}
                        {uploading ? 'Transmitting...' : 'Upload Data'}
                    </button>
                </div>
            </div>

            {/* Chat Area (Floating Container) */}
            <div className="flex-1 flex flex-col relative z-10 px-8 py-6">
                {/* Messages - Centered floating container */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="max-w-4xl mx-auto space-y-8 py-8">
                        {messages.filter(m => !m.mode || m.mode === mode).length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-6 animate-in fade-in duration-700">
                                <div className="w-24 h-24 rounded-full bg-purple-100 flex items-center justify-center border border-purple-200 shadow-xl shadow-purple-100/50">
                                    <Bot className="h-10 w-10 text-purple-600" />
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-light text-gray-800 mb-2">Systems Online</p>
                                    <p className="text-sm text-gray-500">Mode: <span className="text-purple-600 font-mono uppercase">{mode}</span></p>
                                </div>
                            </div>
                        ) : (
                            <>
                                {messages.filter(m => !m.mode || m.mode === mode).map((msg, idx) => (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div className={`max-w-3xl rounded-2xl p-6 backdrop-blur-md border ${msg.role === 'user'
                                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-200 border-purple-500'
                                            : 'bg-white shadow-md border-gray-200 text-gray-700'
                                            }`}>
                                            <div className="flex items-center mb-3 opacity-60">
                                                {msg.role === 'user' ? (
                                                    <User className="h-3 w-3 mr-2" />
                                                ) : (
                                                    <Bot className="h-3 w-3 mr-2" />
                                                )}
                                                <span className="text-xs uppercase tracking-wider font-mono">
                                                    {msg.role === 'user' ? 'User' : `AI Core (${msg.mode || mode})`}
                                                </span>
                                            </div>

                                            {msg.content.startsWith('{') && msg.content.includes('"questions"') ? (
                                                <MemoizedQuizRenderer content={msg.content} />
                                            ) : (
                                                <div className="prose prose-sm max-w-none">
                                                    <ReactMarkdown
                                                        remarkPlugins={[remarkGfm]}
                                                        components={{
                                                            code({ node: _node, className, children, ...props }) {
                                                                return (
                                                                    <code className={`${className ?? ''} bg-gray-800 text-gray-100 px-2 py-1 rounded text-sm`} {...props}>
                                                                        {children}
                                                                    </code>
                                                                )
                                                            }
                                                        }}
                                                    >
                                                        {msg.content}
                                                    </ReactMarkdown>
                                                </div>
                                            )}

                                            {msg.sources && msg.sources.length > 0 && (
                                                <div className="mt-4 pt-4 border-t border-white/20">
                                                    <p className="text-xs uppercase tracking-wider mb-2 opacity-60">Sources</p>
                                                    <div className="space-y-2">
                                                        {msg.sources.map((src, i) => (
                                                            <div key={i} className="text-xs bg-white/10 p-2 rounded">
                                                                <p className="font-semibold">{src.title}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                        </div>
                                    </motion.div>
                                ))}

                                {/* Typing Indicator - Shows while AI is thinking */}
                                {sending && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="flex justify-start"
                                    >
                                        <div className="max-w-3xl rounded-2xl p-6 backdrop-blur-md border bg-white shadow-md border-gray-200">
                                            <div className="flex items-center space-x-2">
                                                <Bot className="h-4 w-4 text-purple-600" />
                                                <div className="flex space-x-1">
                                                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                                </div>
                                                <span className="text-sm text-gray-500 ml-2">AI is thinking...</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Input Area - Floating and centered */}
                <div className="p-4 relative z-20">
                    <div className="max-w-4xl mx-auto bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200 p-4">
                        {/* Mode Switcher - Now above input */}
                        <div className="flex gap-2 mb-3 justify-center">
                            {MENTOR_MODES.map(m => (
                                <button
                                    key={m}
                                    onClick={() => setMode(m)}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${mode === m
                                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>

                        {showCommands && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-white/90 backdrop-blur border border-gray-200 rounded-xl overflow-hidden shadow-2xl">
                                <button
                                    className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm flex items-center text-gray-800 border-b border-gray-100"
                                    onClick={() => selectCommand('/new')}
                                >
                                    <span className="font-mono text-purple-600 mr-3">/new</span> Start Sequence
                                </button>
                                <button
                                    className="w-full text-left px-4 py-3 hover:bg-red-50 text-sm flex items-center text-red-600"
                                    onClick={() => selectCommand('/delete')}
                                >
                                    <span className="font-mono mr-3">/delete</span> Terminate Sequence
                                </button>
                            </div>
                        )}

                        <form onSubmit={handleSendMessage} className="relative flex items-center gap-2">
                            <div className="flex-1 flex items-center bg-white rounded-xl border-2 border-gray-200 focus-within:border-purple-400 transition-all shadow-sm hover:shadow-md">
                                <div className="pl-3 text-purple-500">
                                    <Command className="h-4 w-4" />
                                </div>
                                <input
                                    type="text"
                                    value={input}
                                    onChange={handleInputChange}
                                    placeholder="Type your message..."
                                    className="w-full bg-transparent border-none py-2.5 px-3 text-gray-800 placeholder-gray-400 focus:ring-0 text-sm focus:outline-none"
                                    disabled={sending}
                                    autoFocus
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={!input.trim() || sending}
                                className="p-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md hover:shadow-lg disabled:shadow-sm"
                            >
                                {sending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Send className="h-4 w-4" />
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    )
}
