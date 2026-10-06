import 'server-only'
import { AIMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages'
import { StringOutputParser } from '@langchain/core/output_parsers'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { MentorMode, MessageSource } from '@/lib/api/types'
import type { Database } from '@/server/db/database.types'
import { mentorConfig } from '@/server/ai/config'
import { chatModel } from '@/server/ai/models'
import { SkillChunkRetriever, type ChunkMetadata } from '@/server/rag/retriever'
import type { Document } from '@langchain/core/documents'
import { buildContext, citedSources } from './context'
import { condenseQuestionPrompt, mentorPrompt, modeInstructions } from './prompts'

type Client = SupabaseClient<Database>

export class MentorError extends Error {
    constructor(
        message: string,
        readonly status: 404 | 500
    ) {
        super(message)
        this.name = 'MentorError'
    }
}

export interface MentorTurnInput {
    supabase: Client
    user: User
    skillId: string
    chatId: string | null
    message: string
    mode: MentorMode
}

export interface MentorTurn {
    chatId: string
    /** Yields the answer as it is generated. */
    stream(signal?: AbortSignal): AsyncGenerator<string>
    /** Saves the assistant message and returns the sources it cited. Call once, after streaming. */
    finish(answer: string): Promise<MessageSource[]>
}

function toHistory(rows: { role: string; content: string }[]): BaseMessage[] {
    return rows.map((row) => {
        const content = row.content.slice(0, mentorConfig.historyMessageCharacters)
        return row.role === 'assistant' ? new AIMessage(content) : new HumanMessage(content)
    })
}

/**
 * With earlier turns in play, "why does that happen?" is useless as a search
 * query. Rewrite it into a standalone question; on any failure, fall back to
 * the message as typed.
 */
async function searchQuery(message: string, history: BaseMessage[], skillTitle: string) {
    if (history.length === 0) return message
    try {
        const rewritten = await condenseQuestionPrompt
            .pipe(chatModel({ temperature: 0, maxOutputTokens: 120 }))
            .pipe(new StringOutputParser())
            .invoke({ history, question: message, skill_title: skillTitle })
        return rewritten.trim().slice(0, 500) || message
    } catch {
        return message
    }
}

/**
 * Prepares one mentor turn: validates ownership, stores the learner's message,
 * retrieves supporting excerpts and returns a stream of the answer.
 * All database access runs as the signed-in user, so RLS applies throughout.
 */
export async function prepareMentorTurn(input: MentorTurnInput): Promise<MentorTurn> {
    const { supabase, user, skillId, message, mode } = input

    const { data: skill } = await supabase
        .from('skills')
        .select('id, title, description')
        .eq('id', skillId)
        .maybeSingle()
    if (!skill) throw new MentorError('Skill not found.', 404)

    // Resolve the conversation, creating it on the first message.
    let chatId = input.chatId
    if (chatId) {
        const { data: chat } = await supabase
            .from('chats')
            .select('id')
            .eq('id', chatId)
            .eq('skill_id', skill.id)
            .maybeSingle()
        if (!chat) throw new MentorError('Conversation not found.', 404)
    } else {
        const { data: chat, error } = await supabase
            .from('chats')
            .insert({ user_id: user.id, skill_id: skill.id, title: message.slice(0, 80) })
            .select('id')
            .single()
        if (error || !chat) throw new MentorError('The conversation could not be started.', 500)
        chatId = chat.id
    }

    // Most recent turns, oldest first.
    const { data: recent } = await supabase
        .from('messages')
        .select('role, content')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(mentorConfig.historyMessages)
    const history = toHistory((recent ?? []).reverse())

    const { error: saveError } = await supabase
        .from('messages')
        .insert({ chat_id: chatId, role: 'user', content: message, mode })
    if (saveError) throw new MentorError('Your message could not be saved.', 500)

    // Retrieval is best-effort: if search is unavailable the mentor still answers,
    // and the prompt tells the model that no excerpts were found.
    let documents: Document<ChunkMetadata>[] = []
    try {
        const query = await searchQuery(message, history, skill.title)
        documents = await new SkillChunkRetriever({
            supabase,
            skillId: skill.id,
            allowWeakMatches: true,
        }).retrieve(query)
    } catch (error) {
        console.error('Mentor retrieval failed; answering without excerpts:', error)
    }
    const { context, sources } = buildContext(documents)

    const chain = mentorPrompt
        .pipe(
            chatModel({
                temperature: mentorConfig.temperature,
                maxOutputTokens: mentorConfig.maxOutputTokens,
            })
        )
        .pipe(new StringOutputParser())

    const resolvedChatId = chatId

    return {
        chatId: resolvedChatId,

        async *stream(signal) {
            const chunks = await chain.stream(
                {
                    skill_title: skill.title,
                    skill_description: skill.description
                        ? ` Their stated goal: "${skill.description}".`
                        : '',
                    mode_instructions: modeInstructions(mode),
                    context,
                    history,
                    question: message,
                },
                { signal }
            )
            for await (const chunk of chunks) {
                if (chunk) yield chunk
            }
        },

        async finish(answer) {
            const cited = citedSources(answer, sources)
            const { error } = await supabase.from('messages').insert({
                chat_id: resolvedChatId,
                role: 'assistant',
                content: answer,
                mode,
                sources: cited.length > 0 ? JSON.parse(JSON.stringify(cited)) : null,
            })
            if (error) console.error('Mentor reply could not be saved:', error.message)
            return cited
        },
    }
}
