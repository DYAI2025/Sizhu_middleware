import type { ImageGenerationProvider } from "../../src/lib/providers/interfaces";

export class OpenRouterImageGenerationProvider implements ImageGenerationProvider {
  constructor(
    private baseUrl: string,
    private defaultSecretRef: string,
  ) {}

  private resolveApiKey(secretRef?: string): string {
    const ref = secretRef || this.defaultSecretRef;
    const key = process.env[ref];
    if (key && key.trim().length > 0) return key.trim();
    const fallback = process.env[this.defaultSecretRef];
    if (fallback && fallback.trim().length > 0) return fallback.trim();
    throw new Error(
      `OpenRouter API key not found for secret ref "${ref}". Ensure the env var is set.`,
    );
  }

  async generate(
    prompt: string,
    numCandidates: number,
    format: "png" | "jpeg",
    quality: "standard" | "hd",
    model: string,
    secretRef: string,
    customerData: any,
  ): Promise<
    {
      candidateIndex: number;
      storagePath: string;
      metadata: {
        promptUsed: string;
        model: string;
        provider: string;
        quality: string;
        resolution: string;
      };
    }[]
  > {
    const apiKey = this.resolveApiKey(secretRef);

    const body = {
      model,
      messages: [{ role: "user", content: prompt }],
      n: numCandidates,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown error");
      throw new Error(
        `OpenRouter image generation failed (${response.status}): ${errText}`,
      );
    }

    const data = await response.json();
    const choices: any[] = data?.choices ?? [];

    const results: {
      candidateIndex: number;
      storagePath: string;
      metadata: {
        promptUsed: string;
        model: string;
        provider: string;
        quality: string;
        resolution: string;
      };
    }[] = [];

    for (let i = 0; i < numCandidates; i++) {
      const choice = choices[i];
      const content = choice?.message?.content ?? "";
      const imageUrl = this.extractImageUrl(content);
      const mimeType = format === "png" ? "image/png" : "image/jpeg";

      results.push({
        candidateIndex: i,
        storagePath: imageUrl || `data:${mimeType};base64,placeholder`,
        metadata: {
          promptUsed: prompt.substring(0, 100),
          model,
          provider: "OpenRouter",
          quality,
          resolution: quality === "hd" ? "1792x2304" : "1024x1024",
        },
      });
    }

    return results;
  }

  private extractImageUrl(content: string): string | null {
    const markdownMatch = /!\[.*?\]\((data:[^)]+)\)/.exec(content);
    if (markdownMatch) return markdownMatch[1];
    const urlMatch = /(https?:\/\/[^\s)]+\.(png|jpg|jpeg|gif|webp))/i.exec(content);
    if (urlMatch) return urlMatch[1];
    return null;
  }
}
