// API Configuration
// This file centralizes all API endpoints for easy deployment configuration

export const API_CONFIG = {
    // Backend API URL - uses environment variable or falls back to localhost
    BACKEND_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',

    // Code Runner URL - uses environment variable or falls back to localhost
    CODE_RUNNER_URL: process.env.NEXT_PUBLIC_CODE_RUNNER_URL || 'http://localhost:8001',
} as const;

// API Endpoints
export const API_ENDPOINTS = {
    // Mentor/Chat
    MENTOR_MESSAGE: `${API_CONFIG.BACKEND_URL}/mentor/message`,

    // Documents
    DOCUMENTS_UPLOAD: `${API_CONFIG.BACKEND_URL}/documents/upload`,
    DOCUMENTS_DELETE: (docId: string) => `${API_CONFIG.BACKEND_URL}/documents/${docId}`,

    // Roadmap
    ROADMAP_GENERATE: `${API_CONFIG.BACKEND_URL}/roadmap/generate`,

    // Quiz
    QUIZ_GENERATE: `${API_CONFIG.BACKEND_URL}/quiz/generate`,
    QUIZ_SAVE: `${API_CONFIG.BACKEND_URL}/quiz/save`,
    QUIZ_HISTORY: (skillId: string) => `${API_CONFIG.BACKEND_URL}/quiz/history/${skillId}`,

    // Solver/Coding
    SOLVER_GENERATE: `${API_CONFIG.BACKEND_URL}/solver/generate-question`,
    SOLVER_SUBMIT: `${API_CONFIG.BACKEND_URL}/solver/submit`,
    CODE_EXECUTE: `${API_CONFIG.CODE_RUNNER_URL}/run`,

    // Analytics
    ANALYTICS_SKILL: (skillId: string, userId: string) =>
        `${API_CONFIG.BACKEND_URL}/analytics/skill/${skillId}?user_id=${userId}`,

    // Skills
    SKILLS_DELETE: (skillId: string) => `${API_CONFIG.BACKEND_URL}/skills/${skillId}`,
} as const;
