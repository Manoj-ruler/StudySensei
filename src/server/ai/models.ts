import 'server-only'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
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
