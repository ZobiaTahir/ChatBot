export type MessageRole = 'user' | 'assistant' | 'system';

export type EvaluationMode = 'standard' | 'deep-critique' | 'rapid-direct';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface FeedbackSections {
  coreAnswer?: string;
  strengths?: string[];
  gapsOrRisks?: string[];
  actionableImprovements?: string[];
  critiqueCategories?: {
    category: string;
    points: string[];
  }[];
  nextStep?: string;
  raw: string;
}

export interface PromptTemplate {
  id: string;
  title: string;
  description: string;
  category: 'idea' | 'code' | 'writing' | 'strategy';
  iconName: string;
  prompt: string;
}
