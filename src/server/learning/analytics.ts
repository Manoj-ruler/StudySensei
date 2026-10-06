import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SkillAnalyticsResponse } from '@/lib/api/types'
import type { Database } from '@/server/db/database.types'

type Client = SupabaseClient<Database>

const HISTORY_LIMIT = 100

/**
 * Progress for one skill, computed from the learner's own records.
 * Returns null when the skill does not exist or is not theirs (RLS).
 */
export async function skillAnalytics(
    supabase: Client,
    skillId: string
): Promise<SkillAnalyticsResponse | null> {
    const { data: skill } = await supabase.from('skills').select('id').eq('id', skillId).maybeSingle()
    if (!skill) return null

    const [quizzes, submissions, tasks, documents, chats, history] = await Promise.all([
        supabase
            .from('quizzes')
            .select('score, total_questions')
            .eq('skill_id', skillId)
            .eq('status', 'completed'),
        supabase
            .from('code_submissions')
            .select('question_id, status, coding_questions!inner(skill_id)')
            .eq('coding_questions.skill_id', skillId)
            .eq('status', 'passed'),
        supabase.from('learning_tasks').select('status').eq('skill_id', skillId),
        supabase.from('documents').select('status').eq('skill_id', skillId),
        supabase.from('chats').select('id').eq('skill_id', skillId),
        supabase
            .from('progress_metrics')
            .select('activity_type, score, max_score, created_at')
            .eq('skill_id', skillId)
            .order('created_at', { ascending: false })
            .limit(HISTORY_LIMIT),
    ])

    const chatIds = (chats.data ?? []).map((chat) => chat.id)
    const questionsAsked =
        chatIds.length === 0
            ? 0
            : ((
                  await supabase
                      .from('messages')
                      .select('id', { count: 'exact', head: true })
                      .in('chat_id', chatIds)
                      .eq('role', 'user')
              ).count ?? 0)

    const completed = quizzes.data ?? []
    const earned = completed.reduce((sum, quiz) => sum + (quiz.score ?? 0), 0)
    const possible = completed.reduce((sum, quiz) => sum + (quiz.total_questions ?? 0), 0)

    const taskRows = tasks.data ?? []
    const documentRows = documents.data ?? []

    return {
        summary: {
            total_quizzes: completed.length,
            // Share of all quiz questions answered correctly, 0..1.
            combined_avg_score: possible > 0 ? earned / possible : null,
            code_challenges_solved: new Set((submissions.data ?? []).map((row) => row.question_id)).size,
            roadmap_tasks_done: taskRows.filter((task) => task.status === 'done').length,
            roadmap_tasks_total: taskRows.length,
            questions_asked: questionsAsked,
            documents_ready: documentRows.filter((doc) => doc.status === 'ready').length,
            documents_total: documentRows.length,
        },
        history: (history.data ?? []).map((row) => ({
            activity_type: (row.activity_type ?? 'quiz') as 'quiz' | 'code' | 'chat',
            score: row.score,
            max_score: row.max_score,
            created_at: row.created_at,
        })),
    }
}
