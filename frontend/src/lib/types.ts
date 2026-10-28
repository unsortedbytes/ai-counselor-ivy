export type SessionStatus = "created" | "capturing" | "drafting" | "structuring" | "completed" | "failed";

export type Stage = "capture" | "structure";

export interface Question {
  label: string;
  question: string;
}

export interface Turn {
  role: "user" | "assistant";
  text: string;
  seq: number;
  stage: Stage;
  /** Capture question this turn belongs to; 0 = none. */
  question: number;
}

export interface Answer {
  number: number;
  text: string;
}

export interface Section {
  title: string;
  purpose: string;
  word_count: number;
  guidance: string;
  student_material: string[];
}

export interface EssayStructure {
  working_title: string;
  central_theme: string;
  thesis: string;
  narrative_approach: string;
  approach_rationale: string;
  hook_options: string[];
  sections: Section[];
  college_connection: string;
  tone_and_voice: string;
  avoid: string[];
  gaps_to_fill: string[];
}

export interface EssayPrompt {
  slug: string;
  title: string;
  text: string;
  word_limit: number;
  question_count: number;
}

export interface Session {
  id: string;
  student_name: string;
  grade: string;
  college: string;
  essay_title: string;
  prompt_text: string;
  word_limit: number;
  question_count: number;
  status: SessionStatus;
  error: string;
  created_at: string;
  questions?: Question[];
  current_question?: number;
  interview_summary?: string;
  turns?: Turn[];
  answers?: Answer[];
  structure?: EssayStructure | null;
  structure_model?: string | null;
}

/** "Bryn Mawr, Essay 1: Learning to let go" header for every session page. */
export const headerFor = (s: Session | null, title = "New Essay Brainstorming") =>
  s ? { title, subtitle: [s.college, s.essay_title].filter(Boolean).join(", "), words: s.word_limit } : null;
