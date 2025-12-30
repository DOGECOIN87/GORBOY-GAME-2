import { GoogleGenAI } from "@google/genai";

export const getTacticalBriefing = async (wave: number, hp: number, character: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are the tactical neural link for pilot ${character}. 
      Current mission status:
      Sector: ${wave}
      Hull integrity: ${hp}%
      Task: Provide a single sentence of gritty, high-stakes tactical advice. 
      Use futuristic slang like 'void-drift', 'hull-breach', 'bank-orbit', 'scrap-metal'. 
      Keep it short, aggressive, and immersive.`,
      config: {
        temperature: 0.9,
      },
    });

    return response.text?.trim() || "Stay frosty, pilot. Sector clear... for now.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Void interference detected. Neural link unstable. Eyes up.";
  }
};