import { firebaseConfig } from "./firebase-config.js";

let auth;
let db;
let firebaseAuth;
let firestore;
let firebaseFunctions;
let functions;
let firebaseReadyPromise;

async function ensureFirebaseReady() {
  if (auth) return auth;

  if (!firebaseReadyPromise) {
    firebaseReadyPromise = (async () => {
      // Firebase загружается из официального CDN только тогда, когда нужен вход.
      const [
        firebaseApp,
        loadedFirebaseAuth,
        loadedFirestore,
        loadedFunctions,
      ] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js"),
        import("https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js"),
        import("https://www.gstatic.com/firebasejs/12.15.0/firebase-functions.js"),
      ]);

      firebaseAuth = loadedFirebaseAuth;
      firestore = loadedFirestore;
      firebaseFunctions = loadedFunctions;
      const app = firebaseApp.initializeApp(firebaseConfig);
      auth = firebaseAuth.getAuth(app);
      db = firestore.getFirestore(app);
      functions = firebaseFunctions.getFunctions(app, "asia-northeast3");

      // Сессия остаётся на устройстве после закрытия вкладки.
      await firebaseAuth.setPersistence(auth, firebaseAuth.browserLocalPersistence);
      return auth;
    })();
  }

  return firebaseReadyPromise;
}

export async function loginWithGoogle() {
  const readyAuth = await ensureFirebaseReady();
  const provider = new firebaseAuth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return firebaseAuth.signInWithPopup(readyAuth, provider);
}

export async function logoutAccount() {
  const readyAuth = await ensureFirebaseReady();
  return firebaseAuth.signOut(readyAuth);
}

export function observeAuthState(callback) {
  let unsubscribe = () => {};
  let isActive = true;

  ensureFirebaseReady()
    .then((readyAuth) => {
      if (!isActive) return;
      unsubscribe = firebaseAuth.onAuthStateChanged(readyAuth, callback);
    })
    .catch((error) => {
      console.error("Не удалось подключить Firebase:", error);
      callback(null);
    });

  return () => {
    isActive = false;
    unsubscribe();
  };
}

export async function loadCloudWords(userId) {
  await ensureFirebaseReady();
  const snapshot = await firestore.getDocs(
    firestore.collection(db, "users", userId, "words"),
  );

  return snapshot.docs.map((wordDocument) => wordDocument.data());
}

export async function saveCloudWord(userId, word) {
  await ensureFirebaseReady();
  return firestore.setDoc(
    firestore.doc(db, "users", userId, "words", word.id),
    {
      id: word.id,
      word: word.word,
      originalInput: word.originalInput || word.word,
      createdAt: word.createdAt,
      details: word.details || null,
      updatedAt: firestore.serverTimestamp(),
    },
  );
}

export async function deleteCloudWord(userId, wordId) {
  await ensureFirebaseReady();
  return firestore.deleteDoc(
    firestore.doc(db, "users", userId, "words", wordId),
  );
}

export async function uploadCloudWords(userId, words) {
  await ensureFirebaseReady();
  if (words.length === 0) return;

  const batch = firestore.writeBatch(db);
  words.forEach((word) => {
    batch.set(firestore.doc(db, "users", userId, "words", word.id), {
      id: word.id,
      word: word.word,
      originalInput: word.originalInput || word.word,
      createdAt: word.createdAt,
      details: word.details || null,
      updatedAt: firestore.serverTimestamp(),
    });
  });

  return batch.commit();
}

export async function requestCloudTranslation(wordId) {
  await ensureFirebaseReady();
  const analyzeKoreanWord = firebaseFunctions.httpsCallable(
    functions,
    "analyzeKoreanWord",
  );
  const response = await analyzeKoreanWord({ wordId });
  return response.data;
}
