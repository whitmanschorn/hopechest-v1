/** The shape of a conversation with a model that can ask for lookups. Pure types. */

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** On an assistant message: the lookups it asked for. */
  toolCalls?: ToolCall[];
  /** On a tool message: which call this answers. */
  toolCallId?: string;
}

export interface ChatTool {
  name: string;
  description: string;
  /** JSON Schema of its input. */
  parameters: Record<string, unknown>;
}

export interface ChatReply {
  content: string;
  toolCalls: ToolCall[];
}
