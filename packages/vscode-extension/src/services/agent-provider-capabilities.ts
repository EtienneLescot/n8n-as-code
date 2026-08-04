export type AgentCapabilityProvider =
    | 'anthropic'
    | 'openai'
    | 'google'
    | 'mistral'
    | 'openrouter'
    | 'atlascloud'
    | 'openai-oauth'
    | 'copilot-proxy'
    | 'minimax'
    | 'minimax-token-plan'
    | 'openai-compatible';

export type AgentReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export const AGENT_REASONING_EFFORTS: readonly AgentReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

export interface ReasoningCapability {
    supported: boolean;
    efforts: readonly AgentReasoningEffort[];
    defaultEffort?: AgentReasoningEffort;
    strategy?: 'custom-openai-account' | 'openai-responses' | 'anthropic-thinking' | 'openrouter-reasoning' | 'google-thinking';
}

export interface LangChainReasoningOptions {
    reasoning?: { effort: 'low' | 'medium' | 'high' };
    thinking?: Record<string, unknown>;
    outputConfig?: Record<string, unknown>;
    thinkingConfig?: Record<string, unknown>;
    modelKwargs?: Record<string, unknown>;
    useResponsesApi?: boolean;
}

const OPENAI_REASONING_EFFORTS: readonly AgentReasoningEffort[] = ['none', 'low', 'medium', 'high'];
const ANTHROPIC_REASONING_EFFORTS: readonly AgentReasoningEffort[] = ['none', 'low', 'medium', 'high', 'xhigh'];
const OPENROUTER_REASONING_EFFORTS: readonly AgentReasoningEffort[] = ['none', 'low', 'medium', 'high'];
const GOOGLE_REASONING_EFFORTS: readonly AgentReasoningEffort[] = ['none', 'low', 'medium', 'high'];

export function getReasoningCapability(provider: string, model?: string): ReasoningCapability {
    const normalizedProvider = provider as AgentCapabilityProvider;
    if (normalizedProvider === 'openai-oauth') {
        return { supported: true, efforts: AGENT_REASONING_EFFORTS, defaultEffort: 'medium', strategy: 'custom-openai-account' };
    }
    if ((normalizedProvider === 'openai' || normalizedProvider === 'openai-compatible') && isOpenAIReasoningModel(model)) {
        return { supported: true, efforts: OPENAI_REASONING_EFFORTS, defaultEffort: 'medium', strategy: 'openai-responses' };
    }
    if (normalizedProvider === 'anthropic' && isAnthropicReasoningModel(model)) {
        return { supported: true, efforts: ANTHROPIC_REASONING_EFFORTS, defaultEffort: 'medium', strategy: 'anthropic-thinking' };
    }
    if (normalizedProvider === 'openrouter' && isOpenRouterReasoningModel(model)) {
        return { supported: true, efforts: OPENROUTER_REASONING_EFFORTS, defaultEffort: 'medium', strategy: 'openrouter-reasoning' };
    }
    if (normalizedProvider === 'atlascloud' && isAtlasCloudReasoningModel(model)) {
        return { supported: true, efforts: OPENROUTER_REASONING_EFFORTS, defaultEffort: 'medium', strategy: 'openrouter-reasoning' };
    }
    if (normalizedProvider === 'google' && isGeminiThinkingModel(model)) {
        return { supported: true, efforts: GOOGLE_REASONING_EFFORTS, defaultEffort: 'medium', strategy: 'google-thinking' };
    }
    return { supported: false, efforts: ['none'] };
}

export function normalizeReasoningEffortForCapability(effort: AgentReasoningEffort | undefined, capability: ReasoningCapability): AgentReasoningEffort | undefined {
    if (!capability.supported) return undefined;
    if (!effort) return capability.defaultEffort;
    if (capability.efforts.includes(effort)) return effort;
    if (effort === 'minimal' && capability.efforts.includes('low')) return 'low';
    if (effort === 'xhigh' && capability.efforts.includes('high')) return 'high';
    return capability.defaultEffort;
}

export function buildLangChainReasoningOptions(provider: string, model: string | undefined, effort: AgentReasoningEffort | undefined): LangChainReasoningOptions {
    const capability = getReasoningCapability(provider, model);
    const normalizedEffort = normalizeReasoningEffortForCapability(effort, capability);
    if (!capability.supported || !normalizedEffort || normalizedEffort === 'none') return {};

    switch (capability.strategy) {
        case 'openai-responses':
            return {
                reasoning: { effort: toOpenAIReasoningEffort(normalizedEffort) },
                useResponsesApi: true,
            };
        case 'anthropic-thinking':
            return buildAnthropicReasoningOptions(model, normalizedEffort);
        case 'openrouter-reasoning':
            return {
                modelKwargs: {
                    reasoning: { effort: toOpenAIReasoningEffort(normalizedEffort) },
                    include_reasoning: true,
                },
            };
        case 'google-thinking':
            return {
                thinkingConfig: {
                    includeThoughts: true,
                    thinkingLevel: toGoogleThinkingLevel(normalizedEffort),
                    thinkingBudget: toGoogleThinkingBudget(normalizedEffort),
                },
                modelKwargs: {
                    extra_body: {
                        google: {
                            thinking_config: {
                                include_thoughts: true,
                                thinking_budget: toGoogleThinkingBudget(normalizedEffort),
                            },
                        },
                    },
                },
            };
        default:
            return {};
    }
}

export function getReasoningOptions(provider: string, model?: string, selected?: AgentReasoningEffort): Array<{ id: AgentReasoningEffort; label: string; selected: boolean }> {
    const capability = getReasoningCapability(provider, model);
    return capability.efforts.map((effort) => ({
        id: effort,
        label: effort,
        selected: effort === selected,
    }));
}

export function shouldDisableModelStreamingForToolCalling(provider: string, model?: string): boolean {
    return provider === 'google' && normalizeModelName(model).startsWith('gemini-3');
}

function buildAnthropicReasoningOptions(model: string | undefined, effort: AgentReasoningEffort): LangChainReasoningOptions {
    if (isAnthropicAdaptiveThinkingModel(model)) {
        return {
            thinking: { type: 'adaptive', display: 'summarized' },
            outputConfig: { effort: toAnthropicEffort(effort) },
        };
    }
    return {
        thinking: {
            type: 'enabled',
            budget_tokens: toAnthropicBudgetTokens(effort),
            display: 'summarized',
        },
    };
}

function isOpenAIReasoningModel(model?: string): boolean {
    const normalized = normalizeModelName(model);
    return /^(o\d|o\d-|o\d\.|gpt-5|gpt-5-|gpt-5\.)/.test(normalized);
}

function isAtlasCloudReasoningModel(model?: string): boolean {
    return normalizeModelName(model) === 'deepseek-ai/deepseek-v4-pro';
}

function isAnthropicReasoningModel(model?: string): boolean {
    const normalized = normalizeModelName(model);
    return /^claude-(opus|sonnet|haiku)-4/.test(normalized) || /^claude-3-7/.test(normalized) || normalized.includes('claude-3.7');
}

function isAnthropicAdaptiveThinkingModel(model?: string): boolean {
    const normalized = normalizeModelName(model);
    return /^claude-(opus|sonnet)-4-[67]/.test(normalized) || /^claude-(opus|sonnet)-4\.(6|7)/.test(normalized);
}

function isGeminiThinkingModel(model?: string): boolean {
    const normalized = normalizeModelName(model);
    return normalized.startsWith('gemini-2.5') || normalized.startsWith('gemini-3');
}

function isOpenRouterReasoningModel(model?: string): boolean {
    const normalized = normalizeModelName(model);
    return isOpenAIReasoningModel(normalized)
        || isAnthropicReasoningModel(normalized.replace(/^anthropic\//, ''))
        || normalized.includes('/deepseek-r1')
        || normalized.includes('deepseek/deepseek-r1')
        || normalized.includes('/qwen') && normalized.includes('thinking')
        || normalized.includes('/grok-4')
        || normalized.includes('grok-4');
}

function toOpenAIReasoningEffort(effort: AgentReasoningEffort): 'low' | 'medium' | 'high' {
    if (effort === 'high' || effort === 'xhigh') return 'high';
    if (effort === 'medium') return 'medium';
    return 'low';
}

function toAnthropicEffort(effort: AgentReasoningEffort): 'low' | 'medium' | 'high' | 'xhigh' {
    if (effort === 'xhigh') return 'xhigh';
    if (effort === 'high') return 'high';
    if (effort === 'medium') return 'medium';
    return 'low';
}

function toAnthropicBudgetTokens(effort: AgentReasoningEffort): number {
    if (effort === 'xhigh') return 16_000;
    if (effort === 'high') return 10_000;
    if (effort === 'medium') return 4_000;
    return 1_024;
}

function toGoogleThinkingLevel(effort: AgentReasoningEffort): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (effort === 'high' || effort === 'xhigh') return 'HIGH';
    if (effort === 'medium') return 'MEDIUM';
    return 'LOW';
}

function toGoogleThinkingBudget(effort: AgentReasoningEffort): number {
    if (effort === 'high' || effort === 'xhigh') return 8_192;
    if (effort === 'medium') return 4_096;
    return 1_024;
}

function normalizeModelName(model?: string): string {
    return model?.trim().toLowerCase() || '';
}
