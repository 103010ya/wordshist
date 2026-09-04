import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

const db = getFirestore();
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// Схема заставляет модель вернуть поля, которые уже существуют в нашей карточке.
const WORD_DETAILS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    translation: {
      type: "string",
      description: "Краткий основной перевод слова на русский язык.",
    },
    meaning: {
      type: "string",
      description:
        "Понятное объяснение значения, оттенка, чувств и ситуаций употребления на русском языке.",
    },
    formality: {
      type: "string",
      description:
        "Краткое описание уровня формальности и подходящих собеседников.",
    },
    examples: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tag: {
            type: "string",
            description: "Краткое название использованной грамматической формы.",
          },
          korean: {
            type: "string",
            description: "Короткое естественное предложение на корейском.",
          },
          translation: {
            type: "string",
            description: "Точный перевод предложения на русский.",
          },
        },
        required: ["tag", "korean", "translation"],
      },
    },
  },
  required: ["translation", "meaning", "formality", "examples"],
};

function createPrompt(word) {
  return `
Ты опытный преподаватель корейского языка для русскоязычного ученика.
Подробно, но компактно разбери корейское слово: "${word}".

Правила ответа:
1. Дай естественный основной перевод на русский язык.
2. Объясни значение, эмоциональный оттенок, типичные ситуации употребления и важные ограничения.
3. Отдельно укажи уровень формальности и с кем уместно использовать слово.
4. Создай ровно четыре коротких естественных примера на разные бытовые темы.
5. Первый пример должен быть в простом настоящем времени с базовой широко употребительной вежливой формой 아/어요, без сложной грамматики.
6. Второй пример использует прошедшее время, третий — будущее, четвёртый — другую полезную форму.
7. В каждом примере должно присутствовать само слово или его естественная изменённая форма.
8. Не используй markdown и не добавляй поля, которых нет в заданной структуре.
`;
}

function cleanText(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Поле ${fieldName} отсутствует`);
  }

  return value.trim();
}

function validateDetails(details) {
  if (!details || typeof details !== "object" || !Array.isArray(details.examples)) {
    throw new Error("Некорректная структура ответа");
  }

  if (details.examples.length !== 4) {
    throw new Error("Помощник должен вернуть четыре примера");
  }

  return {
    translation: cleanText(details.translation, "translation"),
    meaning: cleanText(details.meaning, "meaning"),
    formality: cleanText(details.formality, "formality"),
    examples: details.examples.map((example, index) => ({
      tag: cleanText(example?.tag, `examples[${index}].tag`),
      korean: cleanText(example?.korean, `examples[${index}].korean`),
      translation: cleanText(
        example?.translation,
        `examples[${index}].translation`,
      ),
    })),
  };
}

async function checkDailyLimit(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const usageReference = db.doc(`aiUsage/${userId}`);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(usageReference);
    const previousUsage = snapshot.data();
    const requestCount = previousUsage?.date === today ? previousUsage.count : 0;

    // Ограничение защищает бесплатную квоту от случайных повторных запросов.
    if (requestCount >= 30) {
      throw new HttpsError(
        "resource-exhausted",
        "Дневной лимит переводов исчерпан.",
      );
    }

    transaction.set(usageReference, {
      date: today,
      count: requestCount + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export const analyzeKoreanWord = onCall(
  {
    region: "asia-northeast3",
    secrets: [geminiApiKey],
    timeoutSeconds: 60,
    memory: "256MiB",
    maxInstances: 2,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Сначала войдите в профиль.");
    }

    const wordId = request.data?.wordId;
    if (typeof wordId !== "string" || wordId.length > 128) {
      throw new HttpsError("invalid-argument", "Некорректный идентификатор слова.");
    }

    const wordReference = db.doc(`users/${request.auth.uid}/words/${wordId}`);
    const wordSnapshot = await wordReference.get();
    if (!wordSnapshot.exists) {
      throw new HttpsError("not-found", "Слово не найдено в вашем словаре.");
    }

    const word = wordSnapshot.data()?.word?.trim();
    if (!word || word.length > 80) {
      throw new HttpsError("invalid-argument", "Некорректное слово.");
    }

    await checkDailyLimit(request.auth.uid);

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: createPrompt(word),
        config: {
          temperature: 0.25,
          maxOutputTokens: 2200,
          responseMimeType: "application/json",
          responseJsonSchema: WORD_DETAILS_SCHEMA,
        },
      });

      const details = validateDetails(JSON.parse(response.text));
      await wordReference.update({
        details,
        analyzedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return details;
    } catch (error) {
      console.error("Gemini analysis failed", {
        userId: request.auth.uid,
        wordId,
        message: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        "Помощник временно не смог разобрать слово.",
      );
    }
  },
);
