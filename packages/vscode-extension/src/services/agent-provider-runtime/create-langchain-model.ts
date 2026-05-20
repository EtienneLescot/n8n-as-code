import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessageChunk } from '@langchain/core/messages';
import { ChatOpenAI, ChatOpenAICompletions } from '@langchain/openai';
import { ChatCodexOAuth } from './chat-codex-oauth.js';
import { DEFAULT_COPILOT_API_BASE_URL, resolveCopilotApiToken } from './copilot-account.js';
import type { CodexReasoningEffort } from './openai-account.js';

export type LocalAgentProvider =
  | 'openai-oauth'
  | 'copilot-proxy'
  | 'minimax'
  | 'minimax-token-plan';

export interface LocalLangChainModelConfig {
  provider: LocalAgentProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  reasoningEffort?: CodexReasoningEffort;
}

const COPILOT_DEFAULT_HEADERS = {
  'Editor-Version': 'vscode/1.95.3',
  'Editor-Plugin-Version': 'copilot-chat/0.22.4',
  'Openai-Intent': 'conversation-panel',
};

class CopilotCompletionsModel extends ChatOpenAICompletions {
  protected override _convertCompletionsDeltaToBaseMessageChunk(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delta: Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawResponse: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    defaultRole?: any,
  ): BaseMessageChunk {
    const chunk = super._convertCompletionsDeltaToBaseMessageChunk(delta, rawResponse, defaultRole);
    const reasoningText = delta?.reasoning_text;
    if (typeof reasoningText === 'string' && reasoningText.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (chunk as any).additional_kwargs = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...((chunk as any).additional_kwargs ?? {}),
        reasoning_content: reasoningText,
      };
    }
    return chunk;
  }
}

export async function createLocalProviderLangChainModel(config: LocalLangChainModelConfig): Promise<BaseChatModel> {
  switch (config.provider) {
    case 'openai-oauth':
      return new ChatCodexOAuth({
        model: config.model,
        reasoningEffort: config.reasoningEffort,
        accessToken: config.apiKey,
      });

    case 'copilot-proxy': {
      if (!config.apiKey) {
        throw new Error('GitHub Copilot provider is not connected.');
      }
      const runtimeAuth = await resolveCopilotApiToken(config.apiKey);
      const isGeminiModel = /^gemini/i.test(config.model);
      const copilotFields = {
        apiKey: runtimeAuth.token,
        model: config.model,
        configuration: {
          baseURL: config.baseUrl || runtimeAuth.baseUrl || DEFAULT_COPILOT_API_BASE_URL,
          defaultHeaders: COPILOT_DEFAULT_HEADERS,
        },
        ...(isGeminiModel ? { modelKwargs: { thinking_budget: 1024 } } : {}),
      };
      return new ChatOpenAI({
        ...copilotFields,
        completions: new CopilotCompletionsModel(copilotFields),
      });
    }

    case 'minimax':
    case 'minimax-token-plan':
      return new ChatAnthropic({
        apiKey: config.apiKey,
        model: config.model,
        anthropicApiUrl: config.baseUrl ?? 'https://api.minimax.io/anthropic',
      });
  }
}
