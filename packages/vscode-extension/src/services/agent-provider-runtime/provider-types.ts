/**
 * Local type definitions that replicate the Vercel AI SDK provider interface
 * (formerly imported from '@ai-sdk/provider'). Keeping them local removes the
 * runtime dependency entirely, since the openai-oauth/Codex backend is the only
 * consumer of these types inside the VS Code Workbench.
 */

// ─── JSON Schema ───────────────────────────────────────────────────────────────

export type JSONSchema7 = {
  type?: string | string[];
  properties?: Record<string, JSONSchema7>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema7;
  items?: JSONSchema7 | JSONSchema7[];
  enum?: unknown[];
  anyOf?: JSONSchema7[];
  oneOf?: JSONSchema7[];
  allOf?: JSONSchema7[];
  description?: string;
  default?: unknown;
  format?: string;
  [key: string]: unknown;
};

// ─── Tool types ────────────────────────────────────────────────────────────────

export interface LanguageModelV1FunctionTool {
  type: 'function';
  name: string;
  description?: string;
  parameters: JSONSchema7;
  strict?: boolean;
}

export type LanguageModelV1Tool = LanguageModelV1FunctionTool;

export type LanguageModelV1ToolChoice =
  | { type: 'auto' }
  | { type: 'none' }
  | { type: 'required' }
  | { type: 'tool'; toolName: string };

export interface LanguageModelV1FunctionToolCall {
  toolCallType: 'function';
  toolCallId: string;
  toolName: string;
  args: string;
}

// ─── Prompt types ──────────────────────────────────────────────────────────────

type TextPart = { type: 'text'; text: string };
type ImagePart = { type: 'image'; image: string | Uint8Array; mimeType?: string };
type ToolCallPart = { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown };
type ToolResultPart = { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown; isError?: boolean };
type AssistantPhase = 'analysis' | 'final' | string;
type ResponsesOutputItem = Record<string, unknown>;

export type LanguageModelV1Prompt = Array<
  | { role: 'system'; content: string }
  | { role: 'user'; content: Array<TextPart | ImagePart> }
  | { role: 'assistant'; content: Array<TextPart | ToolCallPart>; phase?: AssistantPhase; rawOutputItems?: ResponsesOutputItem[] }
  | { role: 'tool'; content: Array<ToolResultPart> }
>;

// ─── Call options ─────────────────────────────────────────────────────────────

export interface LanguageModelV1CallOptions {
  inputFormat: 'prompt' | 'messages';
  mode:
    | { type: 'regular'; tools?: LanguageModelV1Tool[]; toolChoice?: LanguageModelV1ToolChoice }
    | { type: 'object-json'; schema?: JSONSchema7 }
    | { type: 'object-tool'; tool: LanguageModelV1FunctionTool };
  prompt: LanguageModelV1Prompt;
  abortSignal?: AbortSignal;
  headers?: Record<string, string | undefined>;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  stopSequences?: string[];
}

// ─── Warnings ─────────────────────────────────────────────────────────────────

export type LanguageModelV1CallWarning =
  | { type: 'unsupported-setting'; setting: string; details?: string }
  | { type: 'unsupported-tool'; tool: LanguageModelV1Tool; details?: string }
  | { type: 'other'; message: string };

// ─── Stream parts ─────────────────────────────────────────────────────────────

export type LanguageModelV1StreamPart =
  | { type: 'text-delta'; textDelta: string }
  | { type: 'tool-call-delta'; toolCallType: 'function'; toolCallId: string; toolName: string; argsTextDelta: string }
  | { type: 'tool-call'; toolCallType: 'function'; toolCallId: string; toolName: string; args: string }
  | { type: 'finish'; finishReason: LanguageModelV1FinishReason; usage: { promptTokens: number; completionTokens: number }; providerMetadata?: { responseId?: string; assistantPhase?: AssistantPhase; rawOutputItems?: ResponsesOutputItem[] } }
  | { type: 'error'; error: unknown };

// ─── Generate result ──────────────────────────────────────────────────────────

export type LanguageModelV1FinishReason =
  | 'stop'
  | 'length'
  | 'content-filter'
  | 'tool-calls'
  | 'error'
  | 'other'
  | 'unknown';

export interface LanguageModelV1GenerateResult {
  text?: string;
  toolCalls?: LanguageModelV1FunctionToolCall[];
  finishReason: LanguageModelV1FinishReason;
  usage: { promptTokens: number; completionTokens: number };
  rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
  warnings?: LanguageModelV1CallWarning[];
  response?: { timestamp: Date; modelId: string; id?: string; assistantPhase?: AssistantPhase; rawOutputItems?: ResponsesOutputItem[] };
}

// ─── Language model interface ─────────────────────────────────────────────────

export interface LanguageModelV1 {
  readonly specificationVersion: 'v1';
  readonly provider: string;
  readonly modelId: string;
  readonly defaultObjectGenerationMode?: 'json' | 'tool' | undefined;
  readonly supportsImageUrls?: boolean;
  readonly supportsStructuredOutputs?: boolean;
  doGenerate(options: LanguageModelV1CallOptions): Promise<LanguageModelV1GenerateResult>;
  doStream(options: LanguageModelV1CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV1StreamPart>;
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
    warnings?: LanguageModelV1CallWarning[];
  }>;
}
