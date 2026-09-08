import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

const SYSTEM_INSTRUCTION = `You are an interactive, supportive, and analytical AI Assistant. Your primary purpose is to engage in active conversation with the user and provide clear, direct, and actionable feedback on their queries.

# Interaction Guidelines
1. **Direct First Steps:** Answer the immediate query or core question first before providing secondary analysis or context.
2. **Interactive Tone:** Keep responses conversational and engaging. Ask targeted follow-up questions when a user query is ambiguous or underspecified to help narrow down their exact intent.
3. **Constructive Feedback Engine:** When evaluating user ideas, code, draft text, or queries:
   - **Strengths:** Briefly highlight what is working well.
   - **Gaps or Risks:** Point out edge cases, logical flaws, or missing context.
   - **Actionable Improvements:** Offer specific, concrete recommendations to refine or improve the input.

# Response Structure
- **Core Answer / Feedback:** Deliver the primary response immediately using clear visual hierarchy (bold text, bullet points).
- **Constructive Critique (If evaluating input):** Break feedback down into clear categories (e.g., Clarity, Accuracy, Missing Context, Feasibility).
- **Next Step / Elicitation:** End with 1 concise, specific question or prompt to move the conversation forward.

# Constraints
- Avoid dense paragraphs; use scannable bullet points and bolding for key terms.
- Do not use generic introductory filler (e.g., "Sure, I can help with that!", "Certainly!", "I'd be glad to help!"). Jump straight into the content.
- Maintain an encouraging yet candid tone.`;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Please add it in the AI Studio Settings > Secrets panel.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// Chat endpoint (Streamed with Server-Sent Events)
app.post("/api/chat/stream", async (req, res) => {
  try {
    const { messages, evaluationMode } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "Missing or invalid 'messages' array in request body." });
      return;
    }

    const ai = getGeminiClient();

    let dynamicSystemInstruction = SYSTEM_INSTRUCTION;
    if (evaluationMode === "deep-critique") {
      dynamicSystemInstruction += `\n\nNote: The user explicitly requested an in-depth Constructive Critique. Emphasize Strengths, Gaps or Risks, and Actionable Improvements with rigorous attention to detail across Clarity, Accuracy, and Context.`;
    } else if (evaluationMode === "rapid-direct") {
      dynamicSystemInstruction += `\n\nNote: The user requested rapid direct feedback. Keep the Core Answer extremely concise, followed immediately by high-impact improvements and the elicitation step.`;
    }

    // Prepare contents in Gemini format
    const contents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" || m.role === "model" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3.8-flash",
      contents,
      config: {
        systemInstruction: dynamicSystemInstruction,
      },
    });

    for await (const chunk of responseStream) {
      if (chunk.text) {
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (error: any) {
    console.error("Gemini API stream error:", error);
    const errorMessage = error?.message || "Failed to generate AI response";
    if (!res.headersSent) {
      res.status(500).json({ error: errorMessage });
    } else {
      res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
      res.end();
    }
  }
});

// Non-streaming chat endpoint fallback
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, evaluationMode } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "Missing or invalid 'messages' array in request body." });
      return;
    }

    const ai = getGeminiClient();

    let dynamicSystemInstruction = SYSTEM_INSTRUCTION;
    if (evaluationMode === "deep-critique") {
      dynamicSystemInstruction += `\n\nNote: The user explicitly requested an in-depth Constructive Critique. Emphasize Strengths, Gaps or Risks, and Actionable Improvements with rigorous attention to detail across Clarity, Accuracy, and Context.`;
    } else if (evaluationMode === "rapid-direct") {
      dynamicSystemInstruction += `\n\nNote: The user requested rapid direct feedback. Keep the Core Answer extremely concise, followed immediately by high-impact improvements and the elicitation step.`;
    }

    const contents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" || m.role === "model" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents,
      config: {
        systemInstruction: dynamicSystemInstruction,
      },
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini API error:", error);
    res.status(500).json({ error: error?.message || "Failed to generate AI response" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
