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

// --- Roadmap ---------------------------------------------------------------

export const ROADMAP_TASK_TYPES = ['study', 'practice', 'quiz', 'challenge', 'project'] as const
export type RoadmapTaskType = (typeof ROADMAP_TASK_TYPES)[number]

export interface RoadmapGenerateRequest {
    skill_id: string
    document_ids: string[]
}

export interface RoadmapGenerateResponse {
    /** Markdown summary; the trackable tasks are stored in learning_tasks. */
    roadmap: string
    task_count: number
    /** True when the roadmap was based on the learner's uploaded documents. */
    grounded: boolean
}

// --- Quiz ------------------------------------------------------------------

/** A question as sent to the browser: the answer key stays on the server. */
export interface QuizQuestion {
    id: string
    question: string
    options: string[]
}

export interface QuizGenerateRequest {
    skill_id: string
    num_questions: number
}

export interface QuizGenerateResponse {
    quiz_id: string
    questions: QuizQuestion[]
    /** True when the questions were based on the learner's uploaded documents. */
    grounded: boolean
}

export interface QuizAnswerRequest {
    question_id: string
    answer: number
}

/** Result of grading one answer on the server. */
export interface QuizAnswerResponse {
    is_correct: boolean
    correct_answer: number
    explanation: string | null
    /** True once every question of the quiz has been answered. */
    quiz_completed: boolean
    score: number
    total_questions: number
}

export interface AnsweredQuizQuestion {
    question: string
    options: string[]
    correct_answer: number
    user_answer: number | null
    is_correct: boolean
    explanation?: string | null
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

// --- Coding ----------------------------------------------------------------

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
    /** 'error' means the code never produced gradable output (for example a syntax error). */
    status: 'passed' | 'failed' | 'error'
    passed_tests: number
    total_tests: number
    /** Visible cases first. Hidden cases carry no input, expected or actual output. */
    results: TestResult[]
}

// --- Analytics -------------------------------------------------------------

export interface ActivityRecord {
    activity_type: 'quiz' | 'code' | 'chat'
    score: number | null
    max_score: number | null
    created_at: string
}

export interface SkillAnalyticsResponse {
    summary: {
        total_quizzes: number
        /** Share of all quiz questions answered correctly, 0..1; null before the first quiz. */
        combined_avg_score: number | null
        code_challenges_solved: number
        roadmap_tasks_done: number
        roadmap_tasks_total: number
        questions_asked: number
        documents_ready: number
        documents_total: number
    }
    history: ActivityRecord[]
}
