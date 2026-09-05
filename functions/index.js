import { GoogleGenAI, ThinkingLevel } from "@google/genai";
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
    koreanWord: {
      type: "string",
      description:
        "Естественный корейский эквивалент в словарной форме. Для глаголов и прилагательных форма должна оканчиваться на 다.",
    },
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
            description:
              "Название времени или конструкции, затем знак · и точная корейская форма изучаемого слова из предложения. Например: Прошедшее · 했어요.",
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
  required: ["koreanWord", "translation", "meaning", "formality", "examples"],
};

function createPrompt(word) {
  return `
Ты опытный преподаватель корейского языка для русскоязычного ученика.
Пользователь может ввести слово или короткое выражение на любом языке: "${word}".

Правила ответа:
1. Определи смысл введённого текста и верни его естественный корейский эквивалент в поле koreanWord. Для глагола или прилагательного используй словарную форму на 다. Если текст уже корейский, сохрани или нормализуй его до словарной формы.
2. В поле translation дай краткий естественный перевод корейского слова на русский язык. Не повторяй русский исходный текст без необходимости: выбери точный русский эквивалент.
3. Объясни значение корейского слова, эмоциональный оттенок, типичные ситуации употребления и важные ограничения.
4. Отдельно укажи уровень формальности и с кем уместно использовать слово.
5. Создай ровно четыре коротких естественных примера на разные бытовые темы.
6. Первый пример должен быть в простом настоящем времени с базовой широко употребительной вежливой формой 아/어요, без сложной грамматики.
7. Второй пример использует прошедшее время, третий — будущее, четвёртый — другую полезную форму.
8. В каждом примере должно присутствовать корейское слово из koreanWord или его естественная изменённая форма.
9. В поле tag каждого примера обязательно напиши название формы на русском, знак «·» и точную корейскую форму изучаемого слова, использованную в предложении. Например: «Настоящее · 해요», «Прошедшее · 했어요», «Будущее · 할 거예요», «Желание · 하고 싶어요». Не пиши только название времени и не указывай одно окончание в скобках.
10. Все объяснения и переводы пиши на русском языке. Не используй markdown и не добавляй поля, которых нет в заданной структуре.
`;
}

function cleanText(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Поле ${fieldName} отсутствует`);
  }

  return value.trim();
}

function cleanKoreanWord(value) {
  const koreanWord = cleanText(value, "koreanWord");
  if (koreanWord.length > 80 || !/[가-힣]/u.test(koreanWord)) {
    throw new Error("Корейское слово отсутствует в ответе");
  }

  return koreanWord;
}

function validateAnalysis(analysis) {
  if (!analysis || typeof analysis !== "object" || !Array.isArray(analysis.examples)) {
    throw new Error("Некорректная структура ответа");
  }

  if (analysis.examples.length !== 4) {
    throw new Error("Помощник должен вернуть четыре примера");
  }

  return {
    koreanWord: cleanKoreanWord(analysis.koreanWord),
    details: {
      translation: cleanText(analysis.translation, "translation"),
      meaning: cleanText(analysis.meaning, "meaning"),
      formality: cleanText(analysis.formality, "formality"),
      examples: analysis.examples.map((example, index) => ({
        tag: cleanText(example?.tag, `examples[${index}].tag`),
        korean: cleanText(example?.korean, `examples[${index}].korean`),
        translation: cleanText(
          example?.translation,
          `examples[${index}].translation`,
        ),
      })),
    },
  };
}

function isTemporaryGeminiError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return error?.status === 503 || message.includes('"code":503');
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function generateDetailsWithRetry(ai, word) {
  // Две короткие попытки быстрее, чем долгое ожидание перегруженной модели.
  const retryDelays = [0, 1200];

  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt] > 0) {
      await wait(retryDelays[attempt]);
    }

    try {
      const response = await ai.models.generateContent({
        // Flash-Lite лучше подходит для быстрых переводов и коротких разборов.
        model: "gemini-3.5-flash-lite",
        contents: createPrompt(word),
        config: {
          temperature: 0.25,
          maxOutputTokens: 1600,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MINIMAL,
          },
          responseMimeType: "application/json",
          responseJsonSchema: WORD_DETAILS_SCHEMA,
        },
      });

      return validateAnalysis(JSON.parse(response.text));
    } catch (error) {
      const isLastAttempt = attempt === retryDelays.length - 1;
      if (!isTemporaryGeminiError(error) || isLastAttempt) throw error;

      // Ошибка 503 означает временную перегрузку модели.
      console.warn(`Gemini is busy, retrying: attempt ${attempt + 2}`);
    }
  }

  throw new Error("Не удалось получить ответ Gemini");
}

async function checkDailyLimit(userId, shouldIncrement = false) {
  const today = new Date().toISOString().slice(0, 10);
  const usageReference = db.doc(`aiUsage/${userId}`);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(usageReference);
    const previousUsage = snapshot.data();
    const requestCount = previousUsage?.date === today ? previousUsage.count : 0;

    // Ограничение защищает бесплатную квоту от случайных повторных запросов.
    if (requestCount >= 100) {
      throw new HttpsError(
        "resource-exhausted",
        "Дневной лимит переводов исчерпан.",
      );
    }

    // Счётчик увеличивается только после успешного ответа Gemini.
    if (shouldIncrement) {
      transaction.set(usageReference, {
        date: today,
        count: requestCount + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
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

    const savedWord = wordSnapshot.data();
    const word = savedWord?.word?.trim();
    if (!word || word.length > 80) {
      throw new HttpsError("invalid-argument", "Некорректное слово.");
    }

    await checkDailyLimit(request.auth.uid);

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });
      // После первого разбора сохраняем исходный запрос и используем его повторно.
      const originalInput = savedWord?.originalInput?.trim() || word;
      const analysis = await generateDetailsWithRetry(ai, originalInput);
      await wordReference.update({
        word: analysis.koreanWord,
        originalInput,
        details: analysis.details,
        analyzedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await checkDailyLimit(request.auth.uid, true);

      return {
        koreanWord: analysis.koreanWord,
        originalInput,
        details: analysis.details,
      };
    } catch (error) {
      console.error("Gemini analysis failed", {
        userId: request.auth.uid,
        wordId,
        message: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof HttpsError) throw error;
      if (isTemporaryGeminiError(error)) {
        throw new HttpsError(
          "unavailable",
          "Gemini временно перегружен. Попробуйте немного позже.",
        );
      }
      throw new HttpsError(
        "internal",
        "Помощник временно не смог разобрать слово.",
      );
    }
  },
);
