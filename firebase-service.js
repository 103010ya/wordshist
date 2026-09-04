import { firebaseConfig } from "./firebase-config.js";

let auth;
let firebaseAuth;
let firebaseReadyPromise;

async function ensureFirebaseReady() {
  if (auth) return auth;

  if (!firebaseReadyPromise) {
    firebaseReadyPromise = (async () => {
      // Firebase загружается из официального CDN только тогда, когда нужен вход.
      const [firebaseApp, loadedFirebaseAuth] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js"),
      ]);

      firebaseAuth = loadedFirebaseAuth;
      const app = firebaseApp.initializeApp(firebaseConfig);
      auth = firebaseAuth.getAuth(app);

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
