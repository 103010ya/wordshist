import {
  deleteCloudWord,
  loadCloudWords,
  loginWithGoogle,
  logoutAccount,
  observeAuthState,
  requestCloudTranslation,
  saveCloudWord,
  uploadCloudWords,
} from "./firebase-service.js";

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
const requestTranslationButton = document.querySelector(
  "#requestTranslationButton",
);
const translationRequestMessage = document.querySelector(
  "#translationRequestMessage",
);
const detailsTranslation = document.querySelector("#detailsTranslation");
const detailsMeaning = document.querySelector("#detailsMeaning");
const detailsFormality = document.querySelector("#detailsFormality");
const exampleTags = document.querySelectorAll("[data-example-tag]");
const exampleKoreanTexts = document.querySelectorAll("[data-example-korean]");
const exampleTranslations = document.querySelectorAll(
  "[data-example-translation]",
);
const openProfileButton = document.querySelector("#openProfileButton");
const profileAvatar = document.querySelector("#profileAvatar");
const profileModal = document.querySelector("#profileModal");
const profileBackdrop = document.querySelector("#profileBackdrop");
const closeProfileButton = document.querySelector("#closeProfileButton");
const googleLoginButton = document.querySelector("#googleLoginButton");
const logoutButton = document.querySelector("#logoutButton");
const profileGuestView = document.querySelector("#profileGuestView");
const profileUserView = document.querySelector("#profileUserView");
const profilePhoto = document.querySelector("#profilePhoto");
const profileName = document.querySelector("#profileName");
const profileEmail = document.querySelector("#profileEmail");
const profileMessage = document.querySelector("#profileMessage");

// Стартовое слово показывает возможности словаря даже новому пользователю.
const STARTER_WORD = {
  id: "starter-hada",
  word: "하다",
  createdAt: "2026-09-04T00:00:00.000Z",
};

// При запуске получаем прежние слова из памяти браузера.
let words = loadWords();
let selectedWordId = null;
let currentUser = null;

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
    return Array.isArray(savedWords) && savedWords.length > 0
      ? savedWords
      : [{ ...STARTER_WORD }];
  } catch (error) {
    // Если данные повреждены, оставляем пользователю стартовое слово.
    console.warn("Не удалось прочитать сохранённые слова:", error);
    return [{ ...STARTER_WORD }];
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
  translationRequestMessage.textContent = "";
  renderWordDetails(selectedWord);
  wordDetailsModal.classList.add("modal--open");
  wordDetailsModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  deleteWordButton.focus();
}

// Одна общая функция обслуживает перевод и из карточки, и из общего списка.
async function translateWord(wordId) {
  const wordItem = words.find((item) => item.id === wordId);
  if (!wordItem) return null;

  // Лимитируемый запрос выполняется только после явного нажатия пользователя.
  const analysis = await requestCloudTranslation(wordItem.id);
  // Исходный запрос остаётся доступен для русского поиска.
  wordItem.originalInput =
    analysis.originalInput || wordItem.originalInput || wordItem.word;
  wordItem.word = analysis.koreanWord || wordItem.word;
  wordItem.details = analysis.details || analysis;
  saveWords();
  renderWords();

  return wordItem;
}

async function requestWordTranslation() {
  if (!currentUser) {
    translationRequestMessage.textContent =
      "Сначала войдите через Google, чтобы запросить перевод.";
    return;
  }

  requestTranslationButton.disabled = true;
  requestTranslationButton.textContent = "Переводим…";
  translationRequestMessage.textContent =
    "Помощник разбирает слово. Это может занять несколько секунд.";

  try {
    const translatedWord = await translateWord(selectedWordId);
    if (!translatedWord) return;

    detailsWord.textContent = translatedWord.word;
    renderWordDetails(translatedWord);
    translationRequestMessage.textContent = "Разбор сохранён в вашем словаре.";
  } catch (error) {
    console.error("Не удалось получить перевод:", error);
    translationRequestMessage.textContent = getTranslationErrorMessage(error);
  } finally {
    requestTranslationButton.disabled = false;
    requestTranslationButton.textContent = "Запросить перевод";
  }
}

async function requestQuickTranslation(wordId, quickButton) {
  if (!currentUser) {
    openProfile();
    profileMessage.textContent =
      "Войдите через Google, чтобы запросить перевод.";
    return;
  }

  // Состояние видно прямо в маленькой кнопке, не открывая карточку.
  quickButton.disabled = true;
  quickButton.textContent = "…";
  quickButton.setAttribute("aria-label", "Выполняется перевод");

  try {
    await translateWord(wordId);
  } catch (error) {
    console.error("Не удалось получить быстрый перевод:", error);
    quickButton.disabled = false;
    quickButton.textContent = "↻";
    quickButton.setAttribute("aria-label", "Повторить запрос перевода");
    quickButton.title = getTranslationErrorMessage(error);
  }
}

function getTranslationErrorMessage(error) {
  if (error.code === "functions/unauthenticated") {
    return "Сессия закончилась. Войдите через Google ещё раз.";
  }

  if (error.code === "functions/resource-exhausted") {
    return "Бесплатный лимит временно закончился. Попробуйте позже.";
  }

  return "Не удалось получить разбор. Попробуйте ещё раз.";
}

function renderWordDetails(wordItem) {
  const details = wordItem.details || DEMO_WORD_DETAILS[wordItem.word];

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

function openProfile() {
  profileModal.classList.add("modal--open");
  profileModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeProfile() {
  profileModal.classList.remove("modal--open");
  profileModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  profileMessage.textContent = "";
  openProfileButton.focus();
}

async function showCurrentUser(user) {
  currentUser = user;
  const isLoggedIn = Boolean(user);

  profileGuestView.hidden = isLoggedIn;
  profileUserView.hidden = !isLoggedIn;
  profileAvatar.hidden = !isLoggedIn || !user.photoURL;

  if (isLoggedIn) {
    profileName.textContent = user.displayName || "Пользователь";
    profileEmail.textContent = user.email || "";
    profilePhoto.src = user.photoURL || "";
    profilePhoto.hidden = !user.photoURL;
    profileAvatar.src = user.photoURL || "";

    profileMessage.textContent = "Синхронизируем словарь…";
    try {
      await syncWordsWithCloud(user.uid);
      profileMessage.textContent = "Словарь синхронизирован";
    } catch (error) {
      console.error("Не удалось синхронизировать словарь:", error);
      profileMessage.textContent = "Не удалось загрузить облачный словарь";
    }
  } else {
    profilePhoto.src = "";
    profileAvatar.src = "";
  }
}

async function syncWordsWithCloud(userId) {
  const cloudWords = await loadCloudWords(userId);
  const combinedWords = [...cloudWords, ...words];
  const uniqueWords = new Map();

  // Сравниваем текст без учёта регистра, чтобы одно слово не загрузилось дважды.
  combinedWords.forEach((item) => {
    const normalizedWord = item.word.trim().toLocaleLowerCase();
    if (normalizedWord && !uniqueWords.has(normalizedWord)) {
      uniqueWords.set(normalizedWord, item);
    }
  });

  words = [...uniqueWords.values()].sort(
    (firstWord, secondWord) =>
      new Date(secondWord.createdAt) - new Date(firstWord.createdAt),
  );

  // STARTER_WORD уже находится в локальном списке и попадёт в облако первым входом.
  await uploadCloudWords(userId, words);
  saveWords();
  renderWords();
}

async function handleGoogleLogin() {
  googleLoginButton.disabled = true;
  profileMessage.textContent = "Открываем вход через Google…";

  try {
    await loginWithGoogle();
    profileMessage.textContent = "Вход выполнен";
  } catch (error) {
    console.error("Не удалось войти через Google:", error);
    profileMessage.textContent =
      error.code === "auth/unauthorized-domain"
        ? "Нужно разрешить домен сайта в настройках Firebase"
        : "Не удалось войти. Проверьте настройки Firebase";
  } finally {
    googleLoginButton.disabled = false;
  }
}

async function handleLogout() {
  logoutButton.disabled = true;
  profileMessage.textContent = "Выходим из профиля…";

  try {
    await logoutAccount();
    profileMessage.textContent = "Вы вышли из профиля";
  } catch (error) {
    console.error("Не удалось выйти:", error);
    profileMessage.textContent = "Не удалось выйти из профиля";
  } finally {
    logoutButton.disabled = false;
  }
}

async function deleteSelectedWord() {
  if (!selectedWordId) return;

  const wordIdToDelete = selectedWordId;

  // Оставляем в списке все слова, кроме выбранного пользователем.
  words = words.filter((item) => item.id !== wordIdToDelete);
  saveWords();
  closeWordDetails();
  renderWords();

  if (currentUser) {
    try {
      await deleteCloudWord(currentUser.uid, wordIdToDelete);
    } catch (error) {
      console.error("Не удалось удалить слово из облака:", error);
    }
  }
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

function textMatchesSearch(text, query) {
  const normalizedWord = text.toLocaleLowerCase();
  const normalizedQuery = query.toLocaleLowerCase();

  return (
    normalizedWord.includes(normalizedQuery) ||
    splitKoreanSyllables(normalizedWord).includes(
      splitKoreanSyllables(normalizedQuery),
    ) ||
    getKoreanInitials(normalizedWord).includes(normalizedQuery)
  );
}

function wordMatchesSearch(wordItem, query) {
  const details = wordItem.details || DEMO_WORD_DETAILS[wordItem.word];
  const searchableTexts = [wordItem.word, details?.translation];

  // Английский можно вводить, но после разбора поиск ориентируется на русский и корейский.
  if (/[Ѐ-ӿ㄰-㆏가-힣]/iu.test(wordItem.originalInput || "")) {
    searchableTexts.push(wordItem.originalInput);
  }

  return searchableTexts
    .filter(Boolean)
    .some((text) => textMatchesSearch(text, query));
}

function renderWords() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const visibleWords = words.filter((item) =>
    wordMatchesSearch(item, query),
  );

  // Очищаем старые карточки перед новой отрисовкой списка.
  wordsList.replaceChildren();

  visibleWords.forEach((item) => {
    // Внутри карточки две отдельные кнопки: открытие и быстрый перевод.
    const card = document.createElement("article");
    card.className = "word-card";
    card.addEventListener("click", () => openWordDetails(item.id));

    const openCardButton = document.createElement("button");
    openCardButton.className = "word-card__open";
    openCardButton.type = "button";
    openCardButton.setAttribute("aria-label", `Открыть слово ${item.word}`);

    const word = document.createElement("span");
    word.className = "word-card__word";
    word.textContent = item.word;

    const wordContent = document.createElement("span");
    wordContent.className = "word-card__content";
    wordContent.append(word);

    // Если для слова уже есть разбор, показываем перевод прямо в общем списке.
    const details = item.details || DEMO_WORD_DETAILS[item.word];
    if (details?.translation) {
      const translation = document.createElement("span");
      translation.className = "word-card__translation";
      translation.textContent = details.translation;
      wordContent.append(translation);
    }

    openCardButton.append(wordContent);
    card.append(openCardButton);

    // Кнопка показывается только пока у слова ещё нет готового разбора.
    if (!details?.translation) {
      const quickTranslateButton = document.createElement("button");
      quickTranslateButton.className = "word-card__quick-translate";
      quickTranslateButton.type = "button";
      quickTranslateButton.textContent = "✦";
      quickTranslateButton.setAttribute(
        "aria-label",
        `Запросить перевод слова ${item.word}`,
      );
      quickTranslateButton.title = "Запросить перевод";
      quickTranslateButton.addEventListener("click", (event) => {
        // Не открываем подробности, когда нажата отдельная кнопка перевода.
        event.stopPropagation();
        requestQuickTranslation(item.id, quickTranslateButton);
      });
      card.append(quickTranslateButton);
    }

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

async function addWord(event) {
  event.preventDefault();

  const newWord = wordInput.value.trim();
  if (!newWord) return;

  // Новое слово добавляем в начало, чтобы оно сразу было видно пользователю.
  const newWordItem = {
    id: crypto.randomUUID(),
    word: newWord,
    createdAt: new Date().toISOString(),
  };
  words.unshift(newWordItem);

  saveWords();
  searchInput.value = "";
  renderWords();
  closeModal();

  if (currentUser) {
    try {
      await saveCloudWord(currentUser.uid, newWordItem);
    } catch (error) {
      console.error("Не удалось сохранить слово в облаке:", error);
    }
  }
}

openModalButton.addEventListener("click", openModal);
closeModalButton.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);
wordForm.addEventListener("submit", addWord);
searchInput.addEventListener("input", renderWords);
wordDetailsBackdrop.addEventListener("click", closeWordDetails);
closeDetailsButton.addEventListener("click", closeWordDetails);
deleteWordButton.addEventListener("click", deleteSelectedWord);
requestTranslationButton.addEventListener("click", requestWordTranslation);
openProfileButton.addEventListener("click", openProfile);
profileBackdrop.addEventListener("click", closeProfile);
closeProfileButton.addEventListener("click", closeProfile);
googleLoginButton.addEventListener("click", handleGoogleLogin);
logoutButton.addEventListener("click", handleLogout);

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

  if (event.key === "Escape" && profileModal.classList.contains("modal--open")) {
    closeProfile();
  }
});

// Firebase сообщает нам о входе и выходе пользователя даже после перезагрузки.
observeAuthState(showCurrentUser);

// Первая отрисовка выполняется сразу после загрузки страницы.
renderWords();
