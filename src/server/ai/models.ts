import 'server-only'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import type { z } from 'zod'
import { aiConfig } from '@/server/ai/config'

interface ChatModelOptions {
    temperature: number
    maxOutputTokens: number
}

function gemini(model: string, options: ChatModelOptions) {
    return new ChatGoogleGenerativeAI({
        apiKey: aiConfig.apiKey,
        model,
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
        // Fail over to the fallback model quickly instead of retrying the same one.
        maxRetries: 1,
    })
}

/**
 * The chat model used across the app: the configured Gemini model, falling
 * back to a second one if the first is unavailable or overloaded.
 */
export function chatModel(options: ChatModelOptions) {
    return gemini(aiConfig.chatModel, options).withFallbacks([
        gemini(aiConfig.chatFallbackModel, options),
    ])
}

/**
 * A chat model constrained to return data matching `schema` (via Gemini's
 * structured output), with the same fallback behaviour as `chatModel`.
 */
export function structuredModel<TOutput extends Record<string, unknown>>(
    schema: z.ZodType<TOutput>,
    options: ChatModelOptions
) {
    const build = (model: string) =>
        gemini(model, options).withStructuredOutput<TOutput>(schema)
    return build(aiConfig.chatModel).withFallbacks([build(aiConfig.chatFallbackModel)])
}
