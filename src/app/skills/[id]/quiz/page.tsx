'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, CheckCircle, XCircle, ArrowRight, RefreshCw, ChevronLeft, ChevronDown, ChevronUp, Clock, Award } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import HomeFooter from '@/components/HomeFooter'
import { useToast } from '@/components/ToastProvider'

interface Question {
    question: string
    options: string[]
    correct_answer: number
    explanation: string
}

interface PastQuizQuestion {
    question: string
    options: string[]
    correct_answer: number
    user_answer: number
    is_correct: boolean
}

interface PastQuiz {
    id: string
    score: number
    total_questions: number
    created_at: string
    questions: PastQuizQuestion[]
}

export default function QuizPage() {
    const params = useParams()
    const id = params.id as string
    const router = useRouter()

    const [questions, setQuestions] = useState<Question[]>([])
    const [loading, setLoading] = useState(true)
    const [currentQuestion, setCurrentQuestion] = useState(0)
    const [selectedOption, setSelectedOption] = useState<number | null>(null)
    const [showExplanation, setShowExplanation] = useState(false)
    const [score, setScore] = useState(0)
    const [quizCompleted, setQuizCompleted] = useState(false)
    const [userAnswers, setUserAnswers] = useState<number[]>([])

    // Past quizzes
    const [showHistory, setShowHistory] = useState(false)
    const [pastQuizzes, setPastQuizzes] = useState<PastQuiz[]>([])
    const [expandedQuiz, setExpandedQuiz] = useState<string | null>(null)
    const [loadingHistory, setLoadingHistory] = useState(false)
    const toast = useToast()

    useEffect(() => {
        fetchQuiz()
        fetchHistory()
    }, [])

    const fetchHistory = async () => {
        setLoadingHistory(true)
        try {
            const response = await fetch(`http://localhost:8000/quiz/history/${id}`)
            const data = await response.json()
            setPastQuizzes(data.quizzes || [])
        } catch (error) {
            console.error('Failed to fetch quiz history:', error)
        } finally {
            setLoadingHistory(false)
        }
    }

    const fetchQuiz = async () => {
        setLoading(true)
        setQuizCompleted(false)
        setCurrentQuestion(0)
        setScore(0)
        setQuestions([])
        setUserAnswers([])
        setShowHistory(false)

        try {
            const response = await fetch('http://localhost:8000/quiz/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skill_id: id, num_questions: 5 })
            })

            const data = await response.json()
            if (data.questions) {
                setQuestions(data.questions)
                setUserAnswers(new Array(data.questions.length).fill(-1))
                toast.success(`Quiz generated with ${data.questions.length} questions!`)
            }
        } catch (error) {
            console.error('Failed to fetch quiz:', error)
            toast.error('Failed to generate quiz. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const handleOptionSelect = (index: number) => {
        if (showExplanation) return
        setSelectedOption(index)
        setShowExplanation(true)

        const newAnswers = [...userAnswers]
        newAnswers[currentQuestion] = index
        setUserAnswers(newAnswers)

        if (index === questions[currentQuestion].correct_answer) {
            setScore(prev => prev + 1)
        }
    }

    const handleNextQuestion = async () => {
        setSelectedOption(null)
        setShowExplanation(false)

        if (currentQuestion + 1 < questions.length) {
            setCurrentQuestion(prev => prev + 1)
        } else {
            setQuizCompleted(true)
            // Save Quiz Result
            try {
                const questionsData = questions.map((q, idx) => ({
                    question: q.question,
                    options: q.options,
                    correct_answer: q.correct_answer,
                    user_answer: userAnswers[idx],
                    is_correct: userAnswers[idx] === q.correct_answer
                }))

                const supabase = createClient()
                const { data: { user } } = await supabase.auth.getUser()

                await fetch('http://localhost:8000/quiz/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        skill_id: id,
                        user_id: user?.id,
                        score: score + (selectedOption === questions[currentQuestion].correct_answer ? 1 : 0),
                        total_questions: questions.length,
                        questions: questionsData
                    })
                })

                // Refresh history
                fetchHistory()
            } catch (error) {
                console.error('Failed to save quiz result:', error)
            }
        }
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col bg-gradient-to-br from-purple-50 via-white to-pink-50">
                <DashboardHeader />
                <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
                    <Loader2 className="h-12 w-12 animate-spin text-purple-600 mb-4" />
                    <h2 className="text-xl font-bold text-gray-900">Generating your personalized quiz...</h2>
                    <p className="text-gray-600 mt-2">Our AI is reading your documents to create questions.</p>
                </div>
                <HomeFooter />
            </div>
        )
    }

    if (showHistory) {
        return (
            <div className="min-h-screen flex flex-col bg-gradient-to-br from-purple-50 via-white to-pink-50">
                <DashboardHeader />
                <div className="flex-1 max-w-4xl mx-auto p-8 w-full">
                    <div className="mb-8">
                        <button
                            onClick={() => setShowHistory(false)}
                            className="inline-flex items-center px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors group bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow mb-4"
                        >
                            <ChevronLeft className="h-4 w-4 mr-2 group-hover:-translate-x-0.5 transition-transform" />
                            Back to Quiz
                        </button>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">Past Quizzes</h1>
                        <p className="text-gray-600">Review your previous quiz attempts and learn from your mistakes</p>
                    </div>

                    {loadingHistory ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                        </div>
                    ) : pastQuizzes.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                            <Award className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-600">No past quizzes yet. Complete a quiz to see your history!</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {pastQuizzes.map((quiz) => (
                                <div key={quiz.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-4">
                                                <div className="bg-purple-100 rounded-full p-3">
                                                    <Award className="h-6 w-6 text-purple-600" />
                                                </div>
                                                <div>
                                                    <p className="text-lg font-bold text-gray-900">
                                                        Score: {quiz.score}/{quiz.total_questions} ({Math.round((quiz.score / quiz.total_questions) * 100)}%)
                                                    </p>
                                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                                        <Clock className="h-4 w-4" />
                                                        {formatDate(quiz.created_at)}
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setExpandedQuiz(expandedQuiz === quiz.id ? null : quiz.id)}
                                                className="flex items-center gap-2 px-4 py-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                            >
                                                {expandedQuiz === quiz.id ? (
                                                    <>
                                                        <ChevronUp className="h-5 w-5" />
                                                        Hide Details
                                                    </>
                                                ) : (
                                                    <>
                                                        <ChevronDown className="h-5 w-5" />
                                                        View Details
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                        {expandedQuiz === quiz.id && quiz.questions && (
                                            <div className="mt-6 space-y-6 pt-6 border-t border-gray-200">
                                                {quiz.questions.map((q, qIdx) => (
                                                    <div key={qIdx} className="bg-gray-50 rounded-lg p-6">
                                                        <div className="flex items-start gap-3 mb-4">
                                                            <span className="flex-shrink-0 w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-semibold">
                                                                {qIdx + 1}
                                                            </span>
                                                            <p className="font-medium text-gray-900 flex-1">{q.question}</p>
                                                        </div>
                                                        <div className="space-y-2 ml-11">
                                                            {q.options.map((opt, optIdx) => {
                                                                const isCorrect = optIdx === q.correct_answer
                                                                const isUserAnswer = optIdx === q.user_answer
                                                                const isWrong = isUserAnswer && !isCorrect

                                                                return (
                                                                    <div
                                                                        key={optIdx}
                                                                        className={`p-3 rounded-lg border-2 flex items-center justify-between ${isCorrect
                                                                            ? 'bg-green-50 border-green-500'
                                                                            : isWrong
                                                                                ? 'bg-red-50 border-red-500'
                                                                                : 'bg-white border-gray-200'
                                                                            }`}
                                                                    >
                                                                        <span className={`${isCorrect ? 'text-green-900 font-medium' :
                                                                            isWrong ? 'text-red-900 font-medium' :
                                                                                'text-gray-700'
                                                                            }`}>
                                                                            {opt}
                                                                        </span>
                                                                        {isCorrect && <CheckCircle className="h-5 w-5 text-green-600" />}
                                                                        {isWrong && <XCircle className="h-5 w-5 text-red-600" />}
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <HomeFooter />
            </div>
        )
    }

    if (quizCompleted) {
        const percentage = Math.round((score / questions.length) * 100)
        return (
            <div className="min-h-screen flex flex-col bg-gradient-to-br from-purple-50 via-white to-pink-50">
                <DashboardHeader />
                <div className="flex-1 flex items-center justify-center p-4">
                    <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-gray-200 text-center shadow-xl">
                        <div className="mb-6 flex justify-center">
                            <div className="h-24 w-24 bg-purple-100 rounded-full flex items-center justify-center">
                                <span className="text-4xl font-bold text-purple-600">{percentage}%</span>
                            </div>
                        </div>

                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Quiz Completed!</h2>
                        <p className="text-gray-600 mb-8">
                            You got {score} out of {questions.length} questions correct.
                        </p>

                        <div className="space-y-3">
                            <button
                                onClick={fetchQuiz}
                                className="w-full flex items-center justify-center bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-semibold transition-colors"
                            >
                                <RefreshCw className="h-5 w-5 mr-2" />
                                Try Another Quiz
                            </button>
                            <button
                                onClick={() => setShowHistory(true)}
                                className="w-full flex items-center justify-center bg-pink-600 hover:bg-pink-700 text-white py-3 rounded-xl font-semibold transition-colors"
                            >
                                <Award className="h-5 w-5 mr-2" />
                                View Past Quizzes
                            </button>
                            <Link
                                href={`/dashboard`}
                                className="w-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold transition-colors"
                            >
                                <ChevronLeft className="h-5 w-5 mr-2" />
                                Back to Dashboard
                            </Link>
                        </div>
                    </div>
                </div>
                <HomeFooter />
            </div>
        )
    }

    if (questions.length === 0) {
        return (
            <div className="min-h-screen flex flex-col bg-gradient-to-br from-purple-50 via-white to-pink-50">
                <DashboardHeader />
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <p className="text-xl text-gray-600 mb-4">No questions could be generated.</p>
                        <Link href={`/dashboard`} className="text-purple-600 hover:underline">
                            Go back to dashboard
                        </Link>
                    </div>
                </div>
                <HomeFooter />
            </div>
        )
    }

    const question = questions[currentQuestion]

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-purple-50 via-white to-pink-50 relative">
            {/* Optimized Gradient Blobs - No expensive blur */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
                <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-gradient-to-br from-purple-400 via-pink-300 to-orange-300 rounded-full"></div>
                <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-indigo-400 via-purple-300 to-pink-300 rounded-full"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-gradient-to-br from-purple-200 via-pink-200 to-orange-200 rounded-full"></div>
            </div>

            <DashboardHeader />
            <div className="flex-1 p-6 flex flex-col items-center relative z-10">
                <div className="w-full max-w-2xl">
                    {/* Header */}
                    <div className="flex justify-between items-center mb-8">
                        <Link
                            href="/dashboard"
                            className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm hover:shadow"
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Back
                        </Link>
                        <div className="text-sm font-medium text-gray-600">
                            Question {currentQuestion + 1} of {questions.length}
                        </div>
                        <button
                            onClick={() => setShowHistory(true)}
                            className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm hover:shadow"
                        >
                            <Award className="h-4 w-4" />
                            History
                        </button>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 h-2 rounded-full mb-8 overflow-hidden">
                        <div
                            className="bg-gradient-to-r from-purple-600 to-pink-600 h-full transition-all duration-500 ease-out"
                            style={{ width: `${((currentQuestion) / questions.length) * 100}%` }}
                        />
                    </div>

                    {/* Question Card */}
                    <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-lg mb-6">
                        <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-8 leading-relaxed">
                            {question.question}
                        </h2>

                        <div className="space-y-4">
                            {question.options.map((option, idx) => {
                                let buttonStyle = "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-900"

                                if (showExplanation) {
                                    if (idx === question.correct_answer) {
                                        buttonStyle = "bg-green-50 border-green-500 text-green-900"
                                    } else if (idx === selectedOption) {
                                        buttonStyle = "bg-red-50 border-red-500 text-red-900"
                                    } else {
                                        buttonStyle = "bg-gray-50 border-gray-200 text-gray-500"
                                    }
                                } else if (selectedOption === idx) {
                                    buttonStyle = "bg-purple-100 border-purple-500 text-purple-900"
                                }

                                return (
                                    <button
                                        key={idx}
                                        onClick={() => handleOptionSelect(idx)}
                                        disabled={showExplanation}
                                        className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-center justify-between group ${buttonStyle}`}
                                    >
                                        <span className="font-medium">{option}</span>
                                        {showExplanation && idx === question.correct_answer && (
                                            <CheckCircle className="h-5 w-5 text-green-600" />
                                        )}
                                        {showExplanation && idx === selectedOption && idx !== question.correct_answer && (
                                            <XCircle className="h-5 w-5 text-red-600" />
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Explanation & Next Button */}
                    {showExplanation && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-6 mb-6">
                                <h3 className="font-bold text-purple-900 mb-2">Explanation</h3>
                                <p className="text-purple-800">{question.explanation}</p>
                            </div>

                            <button
                                onClick={handleNextQuestion}
                                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white py-4 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center"
                            >
                                {currentQuestion + 1 === questions.length ? 'Finish Quiz' : 'Next Question'}
                                <ArrowRight className="h-5 w-5 ml-2" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
            <HomeFooter />
        </div>
    )
}
