import { GoogleGenAI } from "@google/genai";

export function getGeminiClient() {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("Gemini Google Search grounding is not configured.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: "", baseUrl },
  });
}