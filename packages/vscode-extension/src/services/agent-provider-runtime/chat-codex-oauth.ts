import type {
  JSONSchema7,
  LanguageModelV1FunctionTool,
  LanguageModelV1Prompt,
  LanguageModelV1StreamPart,
  LanguageModelV1ToolChoice,
} from './provider-types.js';
import {
  BaseChatModel,
  type BaseChatModelCallOptions,
  type BaseChatModelParams,
  type BindToolsInput,
} from '@langchain/core/language_models/chat_models';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, AIMessageChunk, type BaseMessage } from '@langchain/core/messages';
import type { ToolCall } from '@langchain/core/messages/tool';
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { Runnable } from '@langchain/core/runnables';
import { z } from 'zod';
import { createOpenAiAccountLanguageModel, CodexReasoningEffort, ensureCodexSessionId, getDefaultCodexReasoningEffort } from './openai-account.js';

interface ChatCodexOAuthCallOptions extends BaseChatModelCallOptions {
  tools?: LanguageModelV1FunctionTool[];
  reasoningEffort?: CodexReasoningEffort;
}

export class ChatCodexOAuth extends BaseChatModel<ChatCodexOAuthCallOptions> {
  static lc_name() {
    return 'ChatCodexOAuth';
  }

  readonly model: string;

  readonly reasoningEffort: CodexReasoningEffort;

  readonly sessionId: string;

    private readonly boundTools?: LanguageModelV1FunctionTool[];

    private readonly boundCallOptions?: Partial<ChatCodexOAuthCallOptions>;

    private readonly accessToken?: string;

    private previousPrompt?: LanguageModelV1Prompt;

  private previousResponseId?: string;

  constructor(
    fields: BaseChatModelParams & {
      model: string;
      reasoningEffort?: CodexReasoningEffort;
      sessionId?: string;
      boundTools?: LanguageModelV1FunctionTool[];
      boundCallOptions?: Partial<ChatCodexOAuthCallOptions>;
      accessToken?: string;
      previousPrompt?: LanguageModelV1Prompt;
      previousResponseId?: string;
    },
  ) {
    super(fields);
    this.model = fields.model;
    this.reasoningEffort = fields.reasoningEffort ?? getDefaultCodexReasoningEffort(fields.model);
    this.sessionId = ensureCodexSessionId(fields.sessionId);
    this.boundTools = fields.boundTools;
    this.boundCallOptions = fields.boundCallOptions;
    this.accessToken = fields.accessToken;
    this.previousPrompt = fields.previousPrompt;
    this.previousResponseId = fields.previousResponseId;
  }

  _llmType(): string {
    return 'chat-codex-oauth';
  }

  override _identifyingParams(): Record<string, unknown> {
    return {
        provider: 'openai-codex-auth',
        model: this.model,
        reasoningEffort: this.reasoningEffort,
        sessionId: this.sessionId,
      };
  }

  override bindTools(tools: BindToolsInput[], kwargs?: Partial<ChatCodexOAuthCallOptions>): Runnable {
    const normalizedTools = tools
      .map(toLanguageModelTool)
      .filter((tool): tool is LanguageModelV1FunctionTool => Boolean(tool));
    const boundCallOptions = {
      ...(kwargs ?? {}),
    };
    return new ChatCodexOAuth({
      model: this.model,
      reasoningEffort: this.reasoningEffort,
      sessionId: this.sessionId,
      disableStreaming: this.disableStreaming,
      outputVersion: this.outputVersion,
      boundTools: normalizedTools,
      boundCallOptions,
      accessToken: this.accessToken,
      previousPrompt: this.previousPrompt,
      previousResponseId: this.previousResponseId,
      ...(kwargs?.callbacks ? { callbacks: kwargs.callbacks } : {}),
      ...(kwargs?.tags ? { tags: kwargs.tags } : {}),
      ...(kwargs?.metadata ? { metadata: kwargs.metadata } : {}),
    }) as unknown as Runnable;
  }

  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const model = createOpenAiAccountLanguageModel(this.model, this.reasoningEffort, this.sessionId, this.accessToken);
    const boundToolChoice = this.boundCallOptions?.tool_choice;
    const prompt = toLanguageModelPrompt(messages);
    const incremental = buildIncrementalPrompt(this.previousPrompt, prompt, this.previousResponseId);
    const result = await model.doGenerate({
      inputFormat: 'prompt',
      mode: {
        type: 'regular',
        tools: options.tools ?? this.boundTools ?? [],
        toolChoice: normalizeToolChoice(options.tool_choice ?? boundToolChoice),
      },
      prompt: incremental.prompt,
        ...(incremental.previousResponseId ? { headers: { 'x-n8n-previous-response-id': incremental.previousResponseId } } : {}),
      abortSignal: options.signal,
    });
    this.previousPrompt = prompt;
    this.previousResponseId = result.response?.id;

    const text = result.text ?? '';

    const toolCalls = (result.toolCalls ?? []).map<ToolCall>((toolCall) => ({
      id: toolCall.toolCallId,
      name: toolCall.toolName,
      args: parseToolArgs(toolCall.toolName, toolCall.args),
    }));

    const aiMessage = new AIMessage({
      content: text,
      tool_calls: toolCalls,
      additional_kwargs: {
        ...(result.response?.assistantPhase ? { phase: result.response.assistantPhase } : {}),
        ...(result.response?.rawOutputItems ? { codex_output_items: result.response.rawOutputItems } : {}),
      },
      response_metadata: {
        ...(result.response?.assistantPhase ? { phase: result.response.assistantPhase } : {}),
        ...(result.response?.rawOutputItems ? { codex_output_items: result.response.rawOutputItems } : {}),
      },
      usage_metadata: result.usage
        ? {
            input_tokens: result.usage.promptTokens,
            output_tokens: result.usage.completionTokens,
            total_tokens: result.usage.promptTokens + result.usage.completionTokens,
          }
        : undefined,
    });

    return {
      generations: [{
        text,
        message: aiMessage,
        generationInfo: {
          finishReason: result.finishReason,
          warnings: result.warnings,
        },
      }],
      llmOutput: {
        finishReason: result.finishReason,
        usage: result.usage,
        warnings: result.warnings,
      },
    };
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const DEBUG_STREAM = process.env.DEBUG_CODEX_STREAM === '1';
    if (DEBUG_STREAM) console.error('[DEBUG_CODEX_STREAM] _streamResponseChunks() called');

    const model = createOpenAiAccountLanguageModel(this.model, this.reasoningEffort, this.sessionId, this.accessToken);
    const boundToolChoice = this.boundCallOptions?.tool_choice;

    if (DEBUG_STREAM) console.error('[DEBUG_CODEX_STREAM] Calling model.doStream()');

    const prompt = toLanguageModelPrompt(messages);
    const incremental = buildIncrementalPrompt(this.previousPrompt, prompt, this.previousResponseId);
    const result = await model.doStream({
      inputFormat: 'prompt',
      mode: {
        type: 'regular',
        tools: options.tools ?? this.boundTools ?? [],
        toolChoice: normalizeToolChoice(options.tool_choice ?? boundToolChoice),
      },
      prompt: incremental.prompt,
      ...(incremental.previousResponseId ? { headers: { 'x-n8n-previous-response-id': incremental.previousResponseId } } : {}),
      abortSignal: options.signal,
    });

    if (DEBUG_STREAM) console.error('[DEBUG_CODEX_STREAM] doStream() returned, getting reader');

    const reader = result.stream.getReader();
    const toolCallIndexes = new Map<string, number>();
    const getToolCallIndex = (toolCallId: string): number => {
      const existing = toolCallIndexes.get(toolCallId);
      if (existing !== undefined) {
        return existing;
      }
      const next = toolCallIndexes.size;
      toolCallIndexes.set(toolCallId, next);
      return next;
    };

    try {
      if (DEBUG_STREAM) console.error('[DEBUG_CODEX_STREAM] Reading stream...');
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (DEBUG_STREAM) console.error('[DEBUG_CODEX_STREAM] Stream done');
          break;
        }

        if (DEBUG_STREAM) console.error('[DEBUG_CODEX_STREAM] Got part:', JSON.stringify(value).slice(0, 200));

        const part = value as LanguageModelV1StreamPart;

        if (part.type === 'text-delta') {
          if (DEBUG_STREAM) console.error('[DEBUG_CODEX_STREAM] Yielding text-delta:', part.textDelta);
          const message = new AIMessageChunk({
            content: part.textDelta,
            additional_kwargs: {},
          });
          const chunk = new ChatGenerationChunk({
            message,
            text: part.textDelta,
          });
          yield chunk;
          await runManager?.handleLLMNewToken(part.textDelta, { prompt: 0, completion: 0 }, undefined, undefined, undefined, { chunk });
        } else if (part.type === 'tool-call-delta') {
          const index = getToolCallIndex(part.toolCallId);
          const message = new AIMessageChunk({
            content: '',
            tool_call_chunks: [{
              name: part.toolName,
              args: part.argsTextDelta,
              id: part.toolCallId,
              index,
              type: 'tool_call_chunk' as const,
            }],
            additional_kwargs: {
              tool_calls: [{
                id: part.toolCallId,
                index,
                function: {
                  name: part.toolName,
                  arguments: part.argsTextDelta,
                },
              }],
            },
          } as ConstructorParameters<typeof AIMessageChunk>[0]);
          yield new ChatGenerationChunk({ message, text: '' });
        } else if (part.type === 'tool-call') {
          const index = getToolCallIndex(part.toolCallId);
          const parsedArgs = parseToolArgs(part.toolName, part.args);
          const message = new AIMessageChunk({
            content: '',
            tool_calls: [{
              name: part.toolName,
              args: parsedArgs,
              id: part.toolCallId,
              type: 'tool_call' as const,
            }],
            tool_call_chunks: [{
              name: part.toolName,
              args: part.args,
              id: part.toolCallId,
              index,
              type: 'tool_call_chunk' as const,
            }],
            additional_kwargs: {
              tool_calls: [{
                id: part.toolCallId,
                index,
                function: {
                  name: part.toolName,
                  arguments: part.args,
                },
              }],
            },
          } as ConstructorParameters<typeof AIMessageChunk>[0]);
          yield new ChatGenerationChunk({ message, text: '' });
        } else if (part.type === 'finish') {
          this.previousPrompt = prompt;
          this.previousResponseId = part.providerMetadata?.responseId;
          if (DEBUG_STREAM) console.error('[DEBUG_CODEX_STREAM] Got finish:', part.finishReason);
          yield new ChatGenerationChunk({
            message: new AIMessageChunk({
              content: '',
              usage_metadata: {
                input_tokens: part.usage.promptTokens,
                output_tokens: part.usage.completionTokens,
                total_tokens: part.usage.promptTokens + part.usage.completionTokens,
              },
              response_metadata: {
                finishReason: part.finishReason,
                ...(part.providerMetadata?.assistantPhase ? { phase: part.providerMetadata.assistantPhase } : {}),
                ...(part.providerMetadata?.rawOutputItems ? { codex_output_items: part.providerMetadata.rawOutputItems } : {}),
              },
              additional_kwargs: {
                ...(part.providerMetadata?.assistantPhase ? { phase: part.providerMetadata.assistantPhase } : {}),
                ...(part.providerMetadata?.rawOutputItems ? { codex_output_items: part.providerMetadata.rawOutputItems } : {}),
              },
            }),
            text: '',
            generationInfo: {
              finishReason: part.finishReason,
            },
          });
          return;
        } else if (part.type === 'error') {
          throw new Error(`Codex stream error: ${part.error}`);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

function buildIncrementalPrompt(
  previousPrompt: LanguageModelV1Prompt | undefined,
  nextPrompt: LanguageModelV1Prompt,
  previousResponseId: string | undefined,
): { prompt: LanguageModelV1Prompt; previousResponseId?: string } {
  if (!previousPrompt || !previousResponseId || previousPrompt.length >= nextPrompt.length) {
    return { prompt: nextPrompt };
  }

  const samePrefix = previousPrompt.every((message, index) => JSON.stringify(message) === JSON.stringify(nextPrompt[index]));
  if (!samePrefix) {
    return { prompt: nextPrompt };
  }

  let deltaPrompt = nextPrompt.slice(previousPrompt.length);
  while (deltaPrompt[0]?.role === 'assistant') {
    deltaPrompt = deltaPrompt.slice(1);
  }
  if (deltaPrompt.length === 0) {
    return { prompt: nextPrompt };
  }

  return {
    prompt: deltaPrompt,
    previousResponseId,
  };
}

function toLanguageModelPrompt(messages: BaseMessage[]): LanguageModelV1Prompt {
  return messages.map((message) => {
    if (SystemMessage.isInstance(message)) {
      return {
        role: 'system',
        content: stringifyMessageContent(message.content),
      };
    }

    if (HumanMessage.isInstance(message)) {
      return {
        role: 'user',
        content: [{ type: 'text', text: stringifyMessageContent(message.content) }],
      };
    }

    if (ToolMessage.isInstance(message)) {
      return {
        role: 'tool',
        content: [{
          type: 'tool-result',
          toolCallId: message.tool_call_id,
          toolName: message.name || 'tool',
          result: stringifyMessageContent(message.content),
          isError: message.status === 'error',
        }],
      };
    }

    if (AIMessage.isInstance(message)) {
      const content = [] as Array<{ type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }>;
      const text = stringifyMessageContent(message.content);
      if (text) {
        content.push({ type: 'text', text });
      }
      for (const toolCall of message.tool_calls ?? []) {
        content.push({
          type: 'tool-call',
          toolCallId: toolCall.id || toolCall.name,
          toolName: toolCall.name,
          args: toolCall.args,
        });
      }
      return {
        role: 'assistant',
        content,
        ...extractAssistantPhase(message),
        ...extractRawOutputItems(message),
      };
    }

    return {
      role: 'user',
      content: [{ type: 'text', text: stringifyMessageContent(message.content) }],
    };
  });
}

function extractAssistantPhase(message: AIMessage): { phase?: string } {
  const additionalPhase = message.additional_kwargs && typeof message.additional_kwargs === 'object'
    ? (message.additional_kwargs as { phase?: unknown }).phase
    : undefined;
  if (typeof additionalPhase === 'string' && additionalPhase.trim()) {
    return { phase: additionalPhase.trim() };
  }

  const responsePhase = message.response_metadata && typeof message.response_metadata === 'object'
    ? (message.response_metadata as { phase?: unknown }).phase
    : undefined;
  if (typeof responsePhase === 'string' && responsePhase.trim()) {
    return { phase: responsePhase.trim() };
  }

  return {};
}

function extractRawOutputItems(message: AIMessage): { rawOutputItems?: Array<Record<string, unknown>> } {
  const fromAdditional = message.additional_kwargs && typeof message.additional_kwargs === 'object'
    ? (message.additional_kwargs as { codex_output_items?: unknown }).codex_output_items
    : undefined;
  if (Array.isArray(fromAdditional)) {
    return { rawOutputItems: fromAdditional.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') };
  }

  const fromResponse = message.response_metadata && typeof message.response_metadata === 'object'
    ? (message.response_metadata as { codex_output_items?: unknown }).codex_output_items
    : undefined;
  if (Array.isArray(fromResponse)) {
    return { rawOutputItems: fromResponse.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') };
  }

  return {};
}

function stringifyMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('\n')
      .trim();
  }

  return content == null ? '' : String(content);
}

function normalizeToolChoice(toolChoice: ChatCodexOAuthCallOptions['tool_choice']): LanguageModelV1ToolChoice | undefined {
  if (!toolChoice || toolChoice === 'auto') {
    return undefined;
  }

  if (toolChoice === 'any') {
    return { type: 'required' };
  }

  if (toolChoice === 'none') {
    return { type: 'none' };
  }

  if (typeof toolChoice === 'string') {
    return { type: 'tool', toolName: toolChoice };
  }

  return undefined;
}

function parseToolArgs(toolName: string, args: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(args);
    const normalized = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    if (toolName === 'edit_file' && normalized.replace_all === null) {
      delete normalized.replace_all;
    }
    return normalized;
  } catch {
    return {};
  }
}

function toLanguageModelTool(input: BindToolsInput): LanguageModelV1FunctionTool | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const candidate = input as {
    name?: unknown;
    description?: unknown;
    parameters?: unknown;
    schema?: unknown;
  };
  const name = typeof candidate.name === 'string' ? candidate.name : undefined;
  if (!name) {
    return undefined;
  }

  const parameters = toJsonSchema(candidate.parameters ?? candidate.schema);
  return {
    type: 'function',
    name,
    description: typeof candidate.description === 'string' ? candidate.description : undefined,
    parameters,
    strict: true,
  };
}

function toJsonSchema(schema: unknown): JSONSchema7 {
  if (schema instanceof z.ZodType) {
    return normalizeJsonSchema(zodToJsonSchema(schema));
  }

  if (isSerializedZodSchema(schema)) {
    return normalizeJsonSchema(serializedZodToJsonSchema(schema));
  }

  if (schema && typeof schema === 'object') {
    return normalizeJsonSchema(schema as JSONSchema7);
  }

  return normalizeJsonSchema({
    type: 'object',
    properties: {},
    additionalProperties: true,
  });
}

function zodToJsonSchema(schema: z.ZodTypeAny): JSONSchema7 {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault) {
    return zodToJsonSchema(schema._def.innerType);
  }

  if (schema instanceof z.ZodString) {
    return { type: 'string' };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }

  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: [...schema._def.values] };
  }

  if (schema instanceof z.ZodLiteral) {
    return { enum: [schema._def.value] };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema._def.type),
    };
  }

  if (schema instanceof z.ZodUnion) {
    return {
      anyOf: schema._def.options.map((option: z.ZodTypeAny) => zodToJsonSchema(option)),
    };
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape();
    const properties = Object.fromEntries(
      Object.entries(shape).map(([key, value]) => [key, zodToJsonSchema(value as z.ZodTypeAny)]),
    );
    const required = Object.entries(shape)
      .filter(([, value]) => !isOptionalZodSchema(value as z.ZodTypeAny))
      .map(([key]) => key);
    return {
      type: 'object',
      properties,
      additionalProperties: false,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  return {};
}

function isOptionalZodSchema(schema: z.ZodTypeAny): boolean {
  return schema instanceof z.ZodOptional || schema instanceof z.ZodDefault;
}

function isSerializedZodSchema(schema: unknown): schema is { def: { type?: string; [key: string]: unknown } } {
  return Boolean(
    schema
      && typeof schema === 'object'
      && 'def' in (schema as Record<string, unknown>)
      && typeof (schema as { def?: unknown }).def === 'object',
  );
}

function serializedZodToJsonSchema(schema: { def: { type?: string; [key: string]: unknown } }): JSONSchema7 {
  const def = schema.def;
  switch (def.type) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'literal':
      return { enum: [def.value] as JSONSchema7['enum'] };
    case 'enum':
      return { type: 'string', enum: Array.isArray(def.values) ? [...def.values] : [] };
    case 'nullable':
    case 'optional':
    case 'default':
      return serializedInnerTypeToJsonSchema(def.innerType);
    case 'array':
      return {
        type: 'array',
        items: serializedInnerTypeToJsonSchema(def.type),
      };
    case 'union':
      return {
        anyOf: Array.isArray(def.options)
          ? def.options.map((option: z.ZodTypeAny) => serializedInnerTypeToJsonSchema(option))
          : [],
      };
    case 'object': {
      const shapeRecord = typeof def.shape === 'function' ? def.shape() : def.shape;
      const shape = shapeRecord && typeof shapeRecord === 'object' ? shapeRecord as Record<string, unknown> : {};
      const properties = Object.fromEntries(
        Object.entries(shape).map(([key, value]) => [key, serializedInnerTypeToJsonSchema(value)]),
      );
      const required = Object.entries(shape)
        .filter(([, value]) => !isSerializedOptionalSchema(value))
        .map(([key]) => key);
      return {
        type: 'object',
        properties,
        additionalProperties: false,
        ...(required.length > 0 ? { required } : {}),
      };
    }
    default:
      return {};
  }
}

function serializedInnerTypeToJsonSchema(value: unknown): JSONSchema7 {
  return isSerializedZodSchema(value)
    ? serializedZodToJsonSchema(value)
    : toJsonSchema(value);
}

function isSerializedOptionalSchema(value: unknown): boolean {
  return isSerializedZodSchema(value) && (value.def.type === 'optional' || value.def.type === 'default');
}

function normalizeJsonSchema(schema: JSONSchema7): JSONSchema7 {
  const normalized: JSONSchema7 = { ...schema };

  if (normalized.type === 'object') {
    normalized.properties = normalized.properties ?? {};
  }

  if (normalized.items && typeof normalized.items === 'object' && !Array.isArray(normalized.items)) {
    normalized.items = normalizeJsonSchema(normalized.items as JSONSchema7);
  }

  if (Array.isArray(normalized.anyOf)) {
    normalized.anyOf = normalized.anyOf.map((entry) =>
      entry && typeof entry === 'object' && !Array.isArray(entry)
        ? normalizeJsonSchema(entry as JSONSchema7)
        : entry,
    );
  }

  if (normalized.properties) {
    normalized.properties = Object.fromEntries(
      Object.entries(normalized.properties).map(([key, value]) => [
        key,
        value && typeof value === 'object' && !Array.isArray(value)
          ? normalizeJsonSchema(value as JSONSchema7)
          : value,
      ]),
    );
  }

  return normalized;
}
