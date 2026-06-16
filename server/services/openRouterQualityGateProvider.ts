import type { QualityGateProvider } from "../../src/lib/providers/interfaces";

export class OpenRouterQualityGateProvider implements QualityGateProvider {
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

  async evaluate(
    candidates: { candidateIndex: number; storagePath: string; metadata: any }[],
    minScore: number,
    qaPrompt: string,
    secretRef: string,
    model: string,
    resolvedVariables: any,
    iteration: number,
  ): Promise<
    {
      candidateIndex: number;
      score: number;
      status: "accepted" | "rejected" | "not_selected";
      reason: string;
      detailedJson: string;
    }[]
  > {
    const apiKey = this.resolveApiKey(secretRef);

    const results = await Promise.all(
      candidates.map(async (candidate) => {
        const messages = [
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: qaPrompt },
              { type: "image_url" as const, image_url: { url: candidate.storagePath } },
            ],
          },
        ];

        const body = { model, messages };

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => "unknown error");
          throw new Error(
            `OpenRouter quality gate failed for candidate ${candidate.candidateIndex} (${response.status}): ${errText}`,
          );
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content ?? "";
        const score = this.extractScore(text, minScore);
        const passed = score >= minScore;

        return {
          candidateIndex: candidate.candidateIndex,
          score,
          status: passed ? "accepted" as const : "rejected" as const,
          reason: text.substring(0, 500),
          detailedJson: JSON.stringify(
            {
              evaluation_timestamp: new Date().toISOString(),
              llm_model: model,
              raw_response: text.substring(0, 2000),
            },
            null,
            2,
          ),
        };
      }),
    );

    let acceptedIndex: number | null = null;
    let highestScore = -1;
    results.forEach((ev) => {
      if (ev.status === "accepted" && ev.score > highestScore) {
        highestScore = ev.score;
        acceptedIndex = ev.candidateIndex;
      }
    });

    const evaluations = results.map((ev) => {
      if (ev.status === "accepted" && ev.candidateIndex !== acceptedIndex) {
        return { ...ev, status: "not_selected" as const };
      }
      return ev;
    });

    return evaluations;
  }

  private extractScore(text: string, defaultScore: number): number {
    const scoreMatch = text.match(/(\d{1,3})\s*\/\s*100/);
    if (scoreMatch) {
      const parsed = parseInt(scoreMatch[1], 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) return parsed;
    }
    const jsonMatch = text.match(/\{\s*"score"\s*:\s*(\d{1,3})/);
    if (jsonMatch) {
      const parsed = parseInt(jsonMatch[1], 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) return parsed;
    }
    return defaultScore;
  }
}
