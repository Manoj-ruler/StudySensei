'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import CodeEditor from '@/components/CodeEditor'
import { createClient } from '@/utils/supabase/client'
import {
    Play, ChevronLeft, Loader2, List, Code, CheckCircle, XCircle, RefreshCw
} from 'lucide-react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import { useToast } from '@/components/ToastProvider'

interface TestResult {
    input: string
    expected: string
    actual: string
    passed: boolean
    is_hidden: boolean
    error?: string
}

interface Question {
    id: string
    title: string
    description: string
    difficulty: string
}

export default function CodingPage() {
    const params = useParams()
    const id = params.id as string // Skill ID

    // State
    const [question, setQuestion] = useState<Question | null>(null)
    const [language, setLanguage] = useState<string>("python")
    const [code, setCode] = useState<string>("")
    // Boilerplate for languages
    const BOILERPLATE: Record<string, string> = {
        python: `# Write your Python code here\n\ndef solution(input_str):\n    # Your code\n    return input_str\n\n# Do not modify the input reading logic if provided\nimport sys\n# input_str = sys.stdin.read()\n# print(solution(input_str))\n`,
        javascript: `// Write your JavaScript code here\n\nfunction solution(inputStr) {\n    // Your code\n    return inputStr;\n}\n\n// Do not modify standard input reading\nconst fs = require('fs');\nconst input = fs.readFileSync(0, 'utf-8');\n// console.log(solution(input));\n`
    }

    useEffect(() => {
        // Set initial boilerplate
        setCode(BOILERPLATE[language])
    }, [language])
    const [loading, setLoading] = useState(true)
    const [running, setRunning] = useState(false)
    const [results, setResults] = useState<TestResult[] | null>(null)
    const [generating, setGenerating] = useState(false)

    const supabase = createClient()
    const router = useRouter()
    const toast = useToast()

    // Refs for scrollable areas
    const problemScrollRef = useRef<HTMLDivElement>(null)
    const consoleScrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        fetchQuestion()
    }, [id])

    const fetchQuestion = async () => {
        setLoading(true)
        // 1. Check if there's an existing question for this skill (simple logic: get latest)
        const { data } = await supabase
            .from('coding_questions')
            .select('*')
            .eq('skill_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

        if (data) {
            setQuestion(data)
            setLoading(false)
        } else {
            // No question? Should we generate one?
            // Ask user to generate.
            setLoading(false)
        }
    }

    const generateQuestion = async () => {
        setGenerating(true)
        try {
            // Fetch skill title for topic context
            const { data: skill } = await supabase.from('skills').select('title').eq('id', id).single()
            const topic = skill?.title || "Python Basics"

            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const response = await fetch('http://localhost:8000/solver/generate-question', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    skill_id: id,
                    topic: topic,
                    difficulty: "Medium"
                })
            })
            const resData = await response.json()
            if (resData.status === 'success') {
                setQuestion(resData.question)
                setResults(null)
                toast.success("New coding challenge generated!")
            } else {
                toast.error("Failed to generate question. Please try again.")
            }
        } catch (error) {
            console.error("Failed to generate question", error)
            toast.error("Failed to generate question. Please ensure the backend is running.")
        } finally {
            setGenerating(false)
        }
    }

    const runCode = async () => {
        if (!question) return
        setRunning(true)
        setResults(null)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const response = await fetch('http://localhost:8000/solver/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: user.id,
                    question_id: question.id,
                    code: code,
                    language: language
                })
            })

            const data = await response.json()
            if (data.results) {
                setResults(data.results)
                const passedTests = data.results.filter((r: any) => r.passed).length
                const totalTests = data.results.length
                if (passedTests === totalTests) {
                    toast.success(`All ${totalTests} tests passed! 🎉`)
                } else {
                    toast.warning(`${passedTests}/${totalTests} tests passed`)
                }
            } else {
                toast.error("Execution failed without results.")
            }

        } catch (error) {
            console.error("Execution error", error)
            toast.error("Failed to submit code. Please try again.")
        } finally {
            setRunning(false)
        }
    }

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-white">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            </div>
        )
    }

    return (
        <div className="flex min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 text-gray-900 relative">
            {/* Optimized Gradient Blobs - No expensive blur */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
                <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-gradient-to-br from-purple-400 via-pink-300 to-orange-300 rounded-full"></div>
                <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-indigo-400 via-purple-300 to-pink-300 rounded-full"></div>
            </div>

            {/* Left Panel: Problem Description */}
            <div className="w-1/3 border-r border-gray-200 bg-white/95 relative z-10 overflow-hidden">
                {/* Fixed Header */}
                <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white/90">
                    <Link href="/dashboard" className="flex items-center text-gray-600 hover:text-gray-900 transition-colors font-medium">
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Back
                    </Link>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={generateQuestion}
                            disabled={generating}
                            title="Generate a new random question"
                            className="p-1.5 bg-white hover:bg-gray-50 text-gray-700 rounded-lg transition-colors border border-gray-200 shadow-sm hover:shadow"
                        >
                            <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
                        </button>
                        <span className={`text-xs px-3 py-1.5 rounded-lg border font-semibold ${question?.difficulty === 'Easy' ? 'border-green-300 text-green-700 bg-green-50' :
                            question?.difficulty === 'Medium' ? 'border-yellow-300 text-yellow-700 bg-yellow-50' :
                                'border-red-300 text-red-700 bg-red-50'
                            }`}>
                            {question?.difficulty || 'Unknown'}
                        </span>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div
                    ref={problemScrollRef}
                    data-lenis-prevent
                    className="absolute top-[73px] bottom-0 left-0 right-0 overflow-y-scroll p-6"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                >
                    {question ? (
                        <div className="space-y-4">
                            {/* Title Card */}
                            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200 shadow-sm">
                                <h1 className="text-2xl font-bold text-gray-900 mb-2">{question.title}</h1>
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <Code className="h-4 w-4" />
                                    <span>Coding Challenge</span>
                                </div>
                            </div>

                            {/* Description Card */}
                            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Problem Description</h2>
                                <div className="prose prose-sm prose-gray max-w-none">
                                    <style jsx global>{`
                                        .prose h1 {
                                            font-size: 1.5rem;
                                            font-weight: 700;
                                            color: #111827;
                                            margin-top: 1.5rem;
                                            margin-bottom: 0.75rem;
                                        }
                                        .prose h2 {
                                            font-size: 1.25rem;
                                            font-weight: 600;
                                            color: #1f2937;
                                            margin-top: 1.25rem;
                                            margin-bottom: 0.5rem;
                                        }
                                        .prose h3 {
                                            font-size: 1.125rem;
                                            font-weight: 600;
                                            color: #374151;
                                            margin-top: 1rem;
                                            margin-bottom: 0.5rem;
                                        }
                                        .prose p {
                                            color: #4b5563;
                                            line-height: 1.75;
                                            margin-bottom: 1rem;
                                        }
                                        .prose ul, .prose ol {
                                            color: #4b5563;
                                            margin-left: 1.5rem;
                                            margin-bottom: 1rem;
                                        }
                                        .prose li {
                                            margin-bottom: 0.5rem;
                                        }
                                        .prose code {
                                            background-color: #f3f4f6;
                                            color: #7c3aed;
                                            padding: 0.125rem 0.375rem;
                                            border-radius: 0.25rem;
                                            font-size: 0.875em;
                                            font-weight: 500;
                                        }
                                        .prose pre {
                                            background-color: #f9fafb;
                                            border: 1px solid #e5e7eb;
                                            border-radius: 0.5rem;
                                            padding: 1rem;
                                            overflow-x: auto;
                                            margin-bottom: 1rem;
                                        }
                                        .prose pre code {
                                            background-color: transparent;
                                            color: #1f2937;
                                            padding: 0;
                                        }
                                        .prose strong {
                                            color: #111827;
                                            font-weight: 600;
                                        }
                                        .prose blockquote {
                                            border-left: 4px solid #a78bfa;
                                            padding-left: 1rem;
                                            color: #6b7280;
                                            font-style: italic;
                                            margin: 1rem 0;
                                        }
                                    `}</style>
                                    <ReactMarkdown>{question.description}</ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                            <div className="p-6 bg-purple-50 rounded-full">
                                <Code className="h-12 w-12 text-purple-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Active Challenge</h3>
                                <p className="text-gray-600 text-sm mb-4">Generate a coding challenge to get started</p>
                            </div>
                            <button
                                onClick={generateQuestion}
                                disabled={generating}
                                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center shadow-lg hover:shadow-xl font-medium"
                            >
                                {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                                Generate Challenge
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Panel: Code Editor */}
            <div className="flex-1 bg-white/95 relative z-10 overflow-hidden">
                {/* Fixed Header */}
                <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white/80">
                    <div className="flex items-center space-x-3">
                        <div className="font-mono text-sm text-gray-600">main.{language === 'python' ? 'py' : 'js'}</div>
                        <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value)}
                            className="bg-white text-xs text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 shadow-sm"
                        >
                            <option value="python">Python</option>
                            <option value="javascript">JavaScript (Node.js)</option>
                        </select>
                    </div>
                    <button
                        onClick={runCode}
                        disabled={running || !question}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                    >
                        {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                        Run Code
                    </button>
                </div>

                {/* Scrollable Content Area */}
                <div className="absolute top-[73px] bottom-0 left-0 right-0 p-4 flex flex-col" style={{ overscrollBehavior: 'contain' }}>
                    {/* Code Editor */}
                    <div className="flex-1 mb-4 rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                        <CodeEditor
                            value={code}
                            onChange={(val) => setCode(val || "")}
                            height="100%"
                        />
                    </div>

                    {/* Output Console */}
                    <div className="h-48 bg-white rounded-lg border border-gray-200 flex flex-col shadow-sm overflow-hidden">
                        {/* Console Header */}
                        <div className="p-2 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider flex justify-between items-center bg-gray-50">
                            <span>Console Output</span>
                            {results && (
                                <span className={results.every(r => r.passed) ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                                    {results.filter(r => r.passed).length} / {results.length} Tests Passed
                                </span>
                            )}
                        </div>
                        {/* Console Content - Scrollable */}
                        <div
                            ref={consoleScrollRef}
                            data-lenis-prevent
                            className="flex-1 p-4 font-mono text-sm overflow-y-scroll"
                            style={{ WebkitOverflowScrolling: 'touch' }}
                        >
                            {!results && !running && <span className="text-gray-400">Run your code to see results...</span>}
                            {running && <span className="text-purple-600 animate-pulse">Running tests...</span>}
                            {results && (
                                <div className="space-y-3">
                                    {results.map((res, i) => (
                                        <div key={i} className={`p-3 rounded-lg border ${res.passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                            <div className="flex items-start">
                                                {res.passed ? <CheckCircle className="h-4 w-4 text-green-600 mr-2 mt-0.5" /> : <XCircle className="h-4 w-4 text-red-600 mr-2 mt-0.5" />}
                                                <div className="flex-1">
                                                    <p className="text-gray-900 font-bold mb-1">Test Case {i + 1}</p>
                                                    {res.error ? (
                                                        <p className="text-red-600 text-xs">{res.error}</p>
                                                    ) : (
                                                        <>
                                                            {!res.is_hidden ? (
                                                                <div className="grid grid-cols-2 gap-4 text-xs">
                                                                    <div>
                                                                        <span className="text-gray-500 block font-semibold">Input:</span>
                                                                        <code className="text-gray-700 bg-white px-2 py-1 rounded border border-gray-200 inline-block mt-1">{res.input}</code>
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-gray-500 block font-semibold">Expected:</span>
                                                                        <code className="text-gray-700 bg-white px-2 py-1 rounded border border-gray-200 inline-block mt-1">{res.expected}</code>
                                                                        <span className="text-gray-500 block mt-2 font-semibold">Actual:</span>
                                                                        <code className={`${res.passed ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'} px-2 py-1 rounded border inline-block mt-1`}>{res.actual}</code>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <p className="text-gray-500 text-xs italic">Hidden Test Case</p>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
