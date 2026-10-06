// Request/response contracts shared by the browser client and the route handlers.
// The signed-in user is never part of a request: the server reads it from the session.

export const MENTOR_MODES = ['explain', 'coach', 'plan'] as const
export type MentorMode = (typeof MENTOR_MODES)[number]

export function isMentorMode(value: unknown): value is MentorMode {
    return typeof value === 'string' && (MENTOR_MODES as readonly string[]).includes(value)
}

/** A document excerpt the mentor cited, numbered as it appears in the answer ([1], [2], ...). */
export interface MessageSource {
    index: number
    chunk_id: string
    document_id: string
    filename: string
    page_number: number | null
    similarity: number
}

export interface MentorMessageRequest {
    skill_id: string
    chat_id: string | null
    message: string
    mode: MentorMode
}

/** Events streamed by POST /api/mentor/message, one JSON object per line. */
export type MentorStreamEvent =
    | { type: 'meta'; chat_id: string }
    | { type: 'delta'; text: string }
    | { type: 'done'; sources: MessageSource[] }
    | { type: 'error'; message: string }

export interface DocumentUploadResponse {
    document_id: string
}

export interface DocumentSearchResult {
    chunk_id: string
    document_id: string
    filename: string
    page_number: number | null
    similarity: number
    content: string
}

export interface DocumentSearchResponse {
    results: DocumentSearchResult[]
}

export interface RoadmapGenerateRequest {
    skill_id: string
    document_ids: string[]
}

export interface RoadmapGenerateResponse {
    roadmap: string
    roadmap_svg?: string | null
}

export interface QuizQuestion {
    question: string
    options: string[]
    correct_answer: number
    explanation: string
}

export interface QuizGenerateRequest {
    skill_id: string
    num_questions: number
}

export interface QuizGenerateResponse {
    questions: QuizQuestion[]
}

export interface AnsweredQuizQuestion {
    question: string
    options: string[]
    correct_answer: number
    user_answer: number
    is_correct: boolean
}

export interface QuizSaveRequest {
    skill_id: string
    score: number
    total_questions: number
    questions: AnsweredQuizQuestion[]
}

export interface PastQuiz {
    id: string
    score: number
    total_questions: number
    created_at: string
    questions: AnsweredQuizQuestion[]
}

export interface QuizHistoryResponse {
    quizzes: PastQuiz[]
}

export interface CodingQuestion {
    id: string
    title: string
    description: string
    difficulty: string | null
}

export interface GenerateQuestionRequest {
    skill_id: string
    topic: string
    difficulty: 'Easy' | 'Medium' | 'Hard'
}

export interface GenerateQuestionResponse {
    question: CodingQuestion
}

export type CodeLanguage = 'python' | 'javascript'

export interface SubmitCodeRequest {
    question_id: string
    code: string
    language: CodeLanguage
}

export interface TestResult {
    input: string
    expected: string
    actual: string
    passed: boolean
    is_hidden: boolean
    error?: string
}

export interface SubmitCodeResponse {
    results: TestResult[]
}

export interface ActivityRecord {
    activity_type: 'quiz' | 'code' | 'chat'
    score: number | null
}

export interface SkillAnalyticsResponse {
    summary: {
        total_quizzes: number
        combined_avg_score: number | null
        code_challenges_solved: number
    }
    history: ActivityRecord[]
}
