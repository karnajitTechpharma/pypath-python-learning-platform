import { firebaseConfig } from "./firebase-config.js?v=20261003";

const byId = (id) => document.getElementById(id);
const screen = byId("authScreen");
const appView = byId("learningApp");
const form = byId("authForm");
const authError = byId("authError");
const setupNotice = byId("firebaseSetupNotice");
const verifyNotice = byId("verifyNotice");
const signInTab = byId("signInTab");
const signUpTab = byId("signUpTab");
const nameField = byId("nameField");
const confirmField = byId("confirmField");
const emailInput = byId("email");
const passwordInput = byId("password");
const confirmInput = byId("confirmPassword");
const nameInput = byId("displayName");
const submitButton = byId("authSubmit");

let auth;
let mode = "signin";
let currentUser = null;
let firebaseApp;
let toastTimer;

function setError(message = "") {
  authError.textContent = message;
}

function setMode(nextMode) {
  mode = nextMode;
  const creating = mode === "signup";
  byId("authTitle").textContent = creating ? "Create your account" : "Welcome back";
  byId("authSubtitle").textContent = creating
    ? "Create a private learner account to get started."
    : "Sign in to continue learning and keep your account private.";
  submitButton.textContent = creating ? "Create account" : "Sign in";
  nameField.hidden = !creating;
  nameInput.required = creating;
  confirmField.hidden = !creating;
  confirmInput.required = creating;
  byId("forgotPassword").hidden = creating;
  signInTab.setAttribute("aria-selected", String(!creating));
  signUpTab.setAttribute("aria-selected", String(creating));
  passwordInput.autocomplete = creating ? "new-password" : "current-password";
  setError();
}

async function showApp(user) {
  currentUser = user;
  screen.hidden = true;
  appView.hidden = false;
  const name = user.displayName?.trim() || user.email?.split("@")[0] || "Learner";
  byId("welcomeName").textContent = name;
  byId("sidebarName").textContent = name;
  byId("sidebarEmail").textContent = user.email || "Signed in";
  byId("userAvatar").textContent = name.slice(0, 1).toUpperCase();
  byId("currentDate").textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "long", day: "numeric",
  }).format(new Date()).toUpperCase();
  try {
    const { initializeAdminPanel } = await import("./admin.js?v=admin1");
    await initializeAdminPanel(firebaseApp, user);
  } catch (error) {
    byId("publishedStatus").textContent = "Learning database is not available yet. Please try again later.";
    console.error("Learning data could not load:", error);
  }
}

function showSignIn() {
  currentUser = null;
  appView.hidden = true;
  screen.hidden = false;
  byId("authTabs").hidden = false;
  form.hidden = false;
  byId("authFoot").hidden = false;
  byId("signedInNotice").hidden = true;
  byId("resendVerification").hidden = true;
  byId("authSignOut").hidden = true;
  verifyNotice.hidden = true;
  setMode("signin");
}

function showVerification(user) {
  currentUser = user;
  appView.hidden = true;
  screen.hidden = false;
  byId("authTabs").hidden = true;
  form.hidden = true;
  byId("authFoot").hidden = true;
  verifyNotice.hidden = false;
  byId("signedInNotice").hidden = false;
  byId("signedInNotice").textContent = `Verification email sent to ${user.email || "your address"}.`;
  byId("resendVerification").hidden = false;
  byId("authSignOut").hidden = false;
  setError();
}

function friendlyError(error) {
  const messages = {
    "auth/email-already-in-use": "An account already uses this email. Sign in instead or reset the password.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/user-not-found": "No account was found for this email. Create an account first.",
    "auth/wrong-password": "The email or password is incorrect.",
    "auth/weak-password": "Choose a stronger password with at least 8 characters.",
    "auth/too-many-requests": "Too many attempts. Wait a while, then try again.",
    "auth/user-disabled": "This account is disabled. Contact the site administrator.",
    "auth/operation-not-allowed": "Email and password sign-in is not enabled in Firebase Console yet.",
    "auth/network-request-failed": "Could not reach Firebase. Check your internet connection and try again.",
    "auth/unauthorized-domain": "Add this website’s domain to Firebase Authentication’s authorized domains.",
  };
  return messages[error?.code] || "Firebase could not complete that request. Check the setup and try again.";
}

function validateForm() {
  if (!emailInput.checkValidity()) {
    setError("Enter a valid email address.");
    emailInput.focus();
    return false;
  }
  if (passwordInput.value.length < 8) {
    setError("Your password must be at least 8 characters.");
    passwordInput.focus();
    return false;
  }
  if (mode === "signup") {
    if (!nameInput.value.trim()) {
      setError("Enter your name.");
      nameInput.focus();
      return false;
    }
    if (passwordInput.value !== confirmInput.value) {
      setError("The passwords do not match.");
      confirmInput.focus();
      return false;
    }
  }
  return true;
}

function setBusy(busy) {
  submitButton.disabled = busy;
  submitButton.textContent = busy
    ? (mode === "signup" ? "Creating account…" : "Signing in…")
    : (mode === "signup" ? "Create account" : "Sign in");
}

signInTab.addEventListener("click", () => setMode("signin"));
signUpTab.addEventListener("click", () => setMode("signup"));

byId("togglePassword").addEventListener("click", (event) => {
  const reveal = passwordInput.type === "password";
  passwordInput.type = reveal ? "text" : "password";
  confirmInput.type = reveal ? "text" : "password";
  event.currentTarget.textContent = reveal ? "Hide password" : "Show password";
  event.currentTarget.setAttribute("aria-pressed", String(reveal));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError();
  if (!auth || !validateForm()) return;
  setBusy(true);
  try {
    const { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, updateProfile } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js");
    const email = emailInput.value.trim();
    if (mode === "signup") {
      const credential = await createUserWithEmailAndPassword(auth, email, passwordInput.value);
      await updateProfile(credential.user, { displayName: nameInput.value.trim() });
      await sendEmailVerification(credential.user);
      showVerification(credential.user);
    } else {
      await signInWithEmailAndPassword(auth, email, passwordInput.value);
    }
    passwordInput.value = "";
    confirmInput.value = "";
  } catch (error) {
    setError(friendlyError(error));
  } finally {
    setBusy(false);
  }
});

byId("forgotPassword").addEventListener("click", async () => {
  setError();
  if (!auth) return;
  if (!emailInput.checkValidity()) {
    setError("Enter your email address first, then choose Forgot password.");
    emailInput.focus();
    return;
  }
  try {
    const { sendPasswordResetEmail } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js");
    await sendPasswordResetEmail(auth, emailInput.value.trim());
    byId("signedInNotice").textContent = "If an account exists for that address, Firebase has sent a password reset email.";
    byId("signedInNotice").hidden = false;
  } catch (error) {
    setError(friendlyError(error));
  }
});

byId("resendVerification").addEventListener("click", async () => {
  setError();
  if (!currentUser) return;
  try {
    const { sendEmailVerification } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js");
    await sendEmailVerification(currentUser);
    byId("signedInNotice").textContent = `A new verification email was sent to ${currentUser.email || "your address"}.`;
  } catch (error) {
    setError(friendlyError(error));
  }
});

byId("checkVerification").addEventListener("click", async () => {
  if (!currentUser) return;
  setError();
  try {
    await currentUser.reload();
    if (currentUser.emailVerified) {
      await showApp(currentUser);
    } else {
      setError("Firebase still shows this email as unverified. Open the verification link, then try again.");
    }
  } catch (error) {
    setError(friendlyError(error));
  }
});

async function signOut() {
  if (!auth) return;
  try {
    const { signOut: firebaseSignOut } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js");
    await firebaseSignOut(auth);
    passwordInput.value = "";
    confirmInput.value = "";
  } catch (error) {
    setError(friendlyError(error));
  }
}

byId("authSignOut").addEventListener("click", signOut);
byId("dashboardSignOut").addEventListener("click", signOut);

function toast(message) {
  const el = byId("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
}
window.toast = toast;

window.answer = (button, correct) => {
  document.querySelectorAll(".answer").forEach((choice) => choice.classList.remove("correct", "wrong"));
  button.classList.add(correct ? "correct" : "wrong");
  toast(correct ? "Correct! 3 is greater than 2." : "Not quite. 3 is greater than 2, so the condition is true.");
};

function hasFirebaseConfig(config) {
  return [config.apiKey, config.authDomain, config.projectId, config.appId].every(
    (value) => typeof value === "string" && value.length > 0 && !value.includes("PASTE_")
  );
}

async function startFirebase() {
  if (!hasFirebaseConfig(firebaseConfig)) {
    setupNotice.hidden = false;
    submitButton.disabled = true;
    for (const input of form.querySelectorAll("input")) input.disabled = true;
    byId("forgotPassword").disabled = true;
    return;
  }

  try {
    const [{ initializeApp }, authSdk] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js"),
    ]);
    firebaseApp = initializeApp(firebaseConfig);
    auth = authSdk.getAuth(firebaseApp);
    await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
    authSdk.onAuthStateChanged(auth, async (user) => {
      if (!user) {
        showSignIn();
      } else {
        try {
          await user.reload();
          if (user.emailVerified) await showApp(user);
          else showVerification(user);
        } catch (error) {
          setError(friendlyError(error));
          showSignIn();
        }
      }
    }, (error) => {
      setError(friendlyError(error));
      showSignIn();
    });
    setupNotice.hidden = true;
    for (const input of form.querySelectorAll("input")) input.disabled = false;
    submitButton.disabled = false;
    signInTab.disabled = false;
    signUpTab.disabled = false;
    byId("forgotPassword").disabled = false;
  } catch (error) {
    setupNotice.hidden = false;
    setupNotice.textContent = "Could not connect to Firebase. Check the web config, Email/Password provider, authorized domain, and network, then reload this page.";
    submitButton.disabled = true;
    for (const input of form.querySelectorAll("input")) input.disabled = true;
    signInTab.disabled = true;
    signUpTab.disabled = true;
    byId("forgotPassword").disabled = true;
    console.error("Firebase initialization failed:", error);
  }
}

startFirebase();

