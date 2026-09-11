export interface Message {
  sender: 'user' | 'bot';
  text: string;
  image?: string; // This was previously used, might be for bot-sent images or legacy.
  tokenUsage?: TokenUsage;
  sources?: Source[]; // New field for web search sources
  mediaContent?: { // New field for user-sent media content (for display)
    url: string;
    mimeType: string;
    type: 'image' | 'video' | 'audio';
  };
  toolCalls?: ToolCallMessage[]; // New field to display tool calls made by Ani
  toolResults?: ToolResultMessage[]; // New field to display tool results received by Ani
}

export interface Source {
  uri: string;
  title?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatHistoryEntry {
  role: 'user' | 'model' | 'system';
  parts: { text: string }[];
}

export interface ImagePart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

type ContentPart = { text: string } | ImagePart;

// Gemini API Tooling types re-exported for convenience in our own types
export enum Type {
  TYPE_UNSPECIFIED = 'TYPE_UNSPECIFIED',
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  INTEGER = 'INTEGER',
  BOOLEAN = 'BOOLEAN',
  ARRAY = 'ARRAY',
  OBJECT = 'OBJECT',
  NULL = 'NULL',
}

// Fix: Define ToolParameterSchema to correctly represent the OpenAPI Schema for function parameters
export interface ToolParameterSchema {
  type: Type;
  description?: string;
  properties?: { [key: string]: ToolParameterSchema }; // For OBJECT types, defines nested properties
  items?: ToolParameterSchema; // For ARRAY types, defines the schema of array elements
  enum?: string[]; // For STRING, NUMBER, INTEGER types, defines allowed values
  required?: string[]; // Only for OBJECT types, lists required property names
}

export interface FunctionDeclaration {
  name: string;
  description?: string;
  parameters?: ToolParameterSchema; // Fix: Parameters should be a single ToolParameterSchema object
}

export interface FunctionCall {
  name: string;
  args: { [key: string]: any };
  id?: string;
}

export interface ToolOutput {
  name: string;
  id?: string;
  response: {
    result: any;
  };
}

// Custom types for displaying tool interactions in the chat UI
export interface ToolCallMessage {
  name: string;
  args: { [key: string]: any };
}

export interface ToolResultMessage {
  name: string;
  result: any;
}

export interface ToolConfig {
  retrievalConfig?: {
    latLng: {
      latitude: number;
      longitude: number;
    };
  };
}

export interface AniDetails {
  age: number;
  physical: string;
  personality: {
    base: string;
    eve: string;
    ara: string;
    modes: string[];
  };
  relationship: string;
  context: string;
  communicationRules: string[];
  affection: string[];
  goal: string;
}

export interface AniCustomization {
  hairstyle: 'twintails' | 'bob' | 'long' | 'ponytail';
  hairColor: 'platinum' | 'pink' | 'blue' | 'black';
  outfit: 'gothic-lolita' | 'casual' | 'school-uniform';
  eyeColor: 'blue' | 'red' | 'green';
}

export interface DamienDetails {
  age: number;
  location: string;
  device: string;
  network: string;
  passions: string;
  profiles: string;
  budget: string;
  aniCustomization: AniCustomization;
  isSexyModeEnabled: boolean;
  mistralApiKeyOverride: string;
  mistralApiUrlOverride: string;
  aniAffectionLevel: number;
  hasConsentedToAutoSexyMode: boolean;
  geminiDailyTokenCap: number;
  geminiMonthlyTokenCap: number;
  mistralDailyTokenCap: number;
  mistralMonthlyTokenCap: number;
}

// For chat history search
export enum AiProvider {
  GEMINI = 'gemini',
  MISTRAL = 'mistral',
}

export interface SearchResult {
  provider: AiProvider;
  message: Message;
  index: number;
}

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}
