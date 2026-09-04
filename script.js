// Ключ — это имя ячейки, в которой браузер хранит наш список слов.
const STORAGE_KEY = "wordshistWords";

// Находим элементы страницы один раз, чтобы затем управлять ими из JavaScript.
const searchInput = document.querySelector("#searchInput");
const openModalButton = document.querySelector("#openModalButton");
const closeModalButton = document.querySelector("#closeModalButton");
const modalBackdrop = document.querySelector("#modalBackdrop");
const modal = document.querySelector("#modal");
const wordForm = document.querySelector("#wordForm");
const wordInput = document.querySelector("#wordInput");
const wordsList = document.querySelector("#wordsList");
const wordsCount = document.querySelector("#wordsCount");
const emptyState = document.querySelector("#emptyState");
const emptyStateTitle = document.querySelector("#emptyStateTitle");
const emptyStateText = document.querySelector("#emptyStateText");
const wordDetailsModal = document.querySelector("#wordDetailsModal");
const wordDetailsBackdrop = document.querySelector("#wordDetailsBackdrop");
const detailsWord = document.querySelector("#detailsWord");
const deleteWordButton = document.querySelector("#deleteWordButton");
const closeDetailsButton = document.querySelector("#closeDetailsButton");
const detailsTranslation = document.querySelector("#detailsTranslation");
const detailsMeaning = document.querySelector("#detailsMeaning");
const detailsFormality = document.querySelector("#detailsFormality");
const exampleTags = document.querySelectorAll("[data-example-tag]");
const exampleKoreanTexts = document.querySelectorAll("[data-example-korean]");
const exampleTranslations = document.querySelectorAll(
  "[data-example-translation]",
);

// При запуске получаем прежние слова из памяти браузера.
let words = loadWords();
let selectedWordId = null;

// Временный учебный разбор. Позже такие данные будет возвращать API.
const DEMO_WORD_DETAILS = {
  하다: {
    translation: "Делать; заниматься чем-либо",
    meaning:
      "Один из самых употребительных корейских глаголов. Он обозначает выполнение действия и часто присоединяется к существительному: 공부하다 — учиться, 운동하다 — тренироваться. Само 하다 — словарная форма; в обычном предложении окончание меняется в зависимости от ситуации.",
    formality: "Нейтральное",
    examples: [
      {
        tag: "Настоящее · 해요",
        korean: "저는 매일 운동을 해요.",
        translation: "Я каждый день занимаюсь спортом.",
      },
      {
        tag: "Прошедшее · 했어요",
        korean: "어제 숙제를 했어요.",
        translation: "Вчера я сделал домашнее задание.",
      },
      {
        tag: "Будущее · 할 거예요",
        korean: "주말에 청소를 할 거예요.",
        translation: "На выходных я буду убираться.",
      },
      {
        tag: "Желание · 하고 싶어요",
        korean: "한국어를 더 공부하고 싶어요.",
        translation: "Я хочу больше изучать корейский язык.",
      },
    ],
  },
};

function loadWords() {
  try {
    const savedWords = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(savedWords) ? savedWords : [];
  } catch (error) {
    // Если сохранённые данные повреждены, начинаем с пустого списка.
    console.warn("Не удалось прочитать сохранённые слова:", error);
    return [];
  }
}

function saveWords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
}

function openModal() {
  modal.classList.add("modal--open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  // Небольшая задержка нужна, чтобы фокус сработал после открытия окна.
  window.setTimeout(() => wordInput.focus(), 100);
}

function closeModal() {
  modal.classList.remove("modal--open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  wordForm.reset();
  openModalButton.focus();
}

function openWordDetails(wordId) {
  const selectedWord = words.find((item) => item.id === wordId);
  if (!selectedWord) return;

  selectedWordId = wordId;
  detailsWord.textContent = selectedWord.word;
  renderWordDetails(selectedWord.word);
  wordDetailsModal.classList.add("modal--open");
  wordDetailsModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  deleteWordButton.focus();
}

function renderWordDetails(word) {
  const details = DEMO_WORD_DETAILS[word];

  // Для 하다 показываем готовый пример, для остальных слов — прежний шаблон.
  detailsTranslation.textContent = details?.translation || "Основной перевод слова";
  detailsMeaning.textContent =
    details?.meaning ||
    "Что означает слово, какой оттенок передаёт и в каких ситуациях употребляется.";
  detailsFormality.textContent = details?.formality || "Уровень";

  const placeholderTags = [
    "Настоящее · базовое",
    "Прошедшее",
    "Будущее",
    "Другая форма",
  ];

  exampleKoreanTexts.forEach((element, index) => {
    const example = details?.examples[index];
    exampleTags[index].textContent = example?.tag || placeholderTags[index];
    element.textContent = example?.korean || "Корейское предложение";
    exampleTranslations[index].textContent =
      example?.translation || "Перевод предложения";
  });
}

function closeWordDetails() {
  wordDetailsModal.classList.remove("modal--open");
  wordDetailsModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  selectedWordId = null;
  openModalButton.focus();
}

function deleteSelectedWord() {
  if (!selectedWordId) return;

  // Оставляем в списке все слова, кроме выбранного пользователем.
  words = words.filter((item) => item.id !== selectedWordId);
  saveWords();
  closeWordDetails();
  renderWords();
}

// Корейские слоги в Unicode хранятся как цельные символы: например, "하".
// Эти массивы помогают разложить слог на отдельные буквы: "하" → "ㅎㅏ".
const KOREAN_INITIALS = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
const KOREAN_VOWELS = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
  "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
];
const KOREAN_FINALS = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ",
  "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

function splitKoreanSyllables(text) {
  return [...text].map((character) => {
    const code = character.charCodeAt(0);

    // Диапазон от 가 до 힣 содержит все собранные корейские слоги.
    if (code < 0xac00 || code > 0xd7a3) return character;

    const syllableIndex = code - 0xac00;
    const initialIndex = Math.floor(syllableIndex / 588);
    const vowelIndex = Math.floor((syllableIndex % 588) / 28);
    const finalIndex = syllableIndex % 28;

    return (
      KOREAN_INITIALS[initialIndex] +
      KOREAN_VOWELS[vowelIndex] +
      KOREAN_FINALS[finalIndex]
    );
  }).join("");
}

function getKoreanInitials(text) {
  return [...text].map((character) => {
    const code = character.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return character;

    const initialIndex = Math.floor((code - 0xac00) / 588);
    return KOREAN_INITIALS[initialIndex];
  }).join("");
}

function wordMatchesSearch(word, query) {
  const normalizedWord = word.toLocaleLowerCase();
  const normalizedQuery = query.toLocaleLowerCase();

  return (
    normalizedWord.includes(normalizedQuery) ||
    splitKoreanSyllables(normalizedWord).includes(
      splitKoreanSyllables(normalizedQuery),
    ) ||
    getKoreanInitials(normalizedWord).includes(normalizedQuery)
  );
}

function renderWords() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const visibleWords = words.filter((item) =>
    wordMatchesSearch(item.word, query),
  );

  // Очищаем старые карточки перед новой отрисовкой списка.
  wordsList.replaceChildren();

  visibleWords.forEach((item) => {
    // Карточка является кнопкой, поэтому ей удобно пользоваться и с клавиатуры.
    const card = document.createElement("button");
    card.className = "word-card";
    card.type = "button";
    card.setAttribute("aria-label", `Открыть слово ${item.word}`);
    card.addEventListener("click", () => openWordDetails(item.id));

    const word = document.createElement("span");
    word.className = "word-card__word";
    word.textContent = item.word;

    const status = document.createElement("span");
    status.className = "word-card__status";
    status.textContent = "Ожидает разбора";

    card.append(word, status);
    wordsList.append(card);
  });

  wordsCount.textContent = String(words.length);
  emptyState.hidden = visibleWords.length > 0;

  // Для пустого поиска и пустого словаря показываем разные подсказки.
  if (words.length > 0 && visibleWords.length === 0) {
    emptyStateTitle.textContent = "Ничего не найдено";
    emptyStateText.textContent = "Попробуйте изменить запрос в строке поиска.";
  } else {
    emptyStateTitle.textContent = "Словарь пока пуст";
    emptyStateText.textContent =
      "Нажмите на плюс и сохраните первое корейское слово.";
  }
}

function addWord(event) {
  event.preventDefault();

  const newWord = wordInput.value.trim();
  if (!newWord) return;

  // Новое слово добавляем в начало, чтобы оно сразу было видно пользователю.
  words.unshift({
    id: crypto.randomUUID(),
    word: newWord,
    createdAt: new Date().toISOString(),
  });

  saveWords();
  searchInput.value = "";
  renderWords();
  closeModal();
}

openModalButton.addEventListener("click", openModal);
closeModalButton.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);
wordForm.addEventListener("submit", addWord);
searchInput.addEventListener("input", renderWords);
wordDetailsBackdrop.addEventListener("click", closeWordDetails);
closeDetailsButton.addEventListener("click", closeWordDetails);
deleteWordButton.addEventListener("click", deleteSelectedWord);

// Escape — привычный способ закрыть всплывающее окно с клавиатуры.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal.classList.contains("modal--open")) {
    closeModal();
  }

  if (
    event.key === "Escape" &&
    wordDetailsModal.classList.contains("modal--open")
  ) {
    closeWordDetails();
  }
});

// Первая отрисовка выполняется сразу после загрузки страницы.
renderWords();
