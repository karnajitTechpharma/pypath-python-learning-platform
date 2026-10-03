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
const googleButton = byId("googleSignIn");

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


const firestoreUrl = "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
let profileSdk;
let profileDb;
let selectedPhotoData = "";
let photoRemoved = false;

function renderSidebarAvatar(photo, name) {
  const avatar = byId("userAvatar");
  if (!avatar) return;
  avatar.replaceChildren();
  if (photo) {
    const image = document.createElement("img");
    image.src = photo;
    image.alt = "";
    avatar.append(image);
  } else {
    avatar.textContent = (name || "Learner").trim().slice(0, 1).toUpperCase() || "👤";
  }
}

function renderProfilePhoto(photo, name) {
  const image = byId("profilePhoto");
  const initial = byId("profileInitial");
  if (!image || !initial) return;
  image.hidden = !photo;
  initial.hidden = Boolean(photo);
  if (photo) image.src = photo;
  else initial.textContent = (name || "Learner").trim().slice(0, 1).toUpperCase() || "👤";
}

function setProfileMessage(message, isError = false) {
  const status = byId("profileStatus");
  status.textContent = message;
  status.style.color = isError ? "#a34832" : "";
}

function openProfile() {
  byId("profilePage").hidden = false;
  byId("profileName").focus();
}

async function compressProfilePhoto(file) {
  if (!file.type.startsWith("image/")) throw new Error("Choose a PNG, JPG, or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image under 5 MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.72, 0.62, 0.52]) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 180 * 1024) {
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read that image."));
          reader.readAsDataURL(blob);
        });
      }
    }
    throw new Error("That image is too large after compression. Try a smaller photo.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function initializeProfile(user) {
  if (!byId("profileForm").dataset.bound) {
    byId("profileForm").addEventListener("submit", saveProfile);
    byId("profileOpen").addEventListener("click", openProfile);
    byId("profileOpenTop").addEventListener("click", openProfile);
    byId("profileClose").addEventListener("click", () => { byId("profilePage").hidden = true; });
    byId("profileSignOut").addEventListener("click", signOut);
    byId("removeProfilePhoto").addEventListener("click", () => {
      selectedPhotoData = "";
      photoRemoved = true;
      renderProfilePhoto("", byId("profileName").value);
      setProfileMessage("Photo removed. Save changes to keep it removed.");
    });
    byId("profilePhotoFile").addEventListener("change", async (event) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) return;
      setProfileMessage("Preparing your photo…");
      try {
        selectedPhotoData = await compressProfilePhoto(file);
        photoRemoved = false;
        renderProfilePhoto(selectedPhotoData, byId("profileName").value);
        setProfileMessage("Photo ready. Save changes to keep it.");
      } catch (error) {
        setProfileMessage(error.message || "Could not use that photo.", true);
      } finally {
        input.value = "";
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !byId("profilePage").hidden) byId("profilePage").hidden = true;
    });
    byId("profileForm").dataset.bound = "true";
  }
  const { getFirestore, doc, getDoc, setDoc, serverTimestamp } = await import(firestoreUrl);
  profileSdk = { doc, getDoc, setDoc, serverTimestamp, getFirestore };
  profileDb = getFirestore(firebaseApp);
  const defaultName = user.displayName || user.email?.split("@")[0] || "Learner";
  byId("profileName").value = defaultName;
  byId("profileEmail").value = user.email || "";
  const snapshot = await getDoc(doc(profileDb, "users", user.uid));
  const profile = snapshot.exists() ? snapshot.data() : {};
  const name = profile.displayName || defaultName;
  photoRemoved = Boolean(profile.photoRemoved);
  selectedPhotoData = profile.photoDataUrl || (!photoRemoved ? user.photoURL || "" : "");
  byId("profileName").value = name;
  byId("profileEmail").value = user.email || "";
  byId("profileBio").value = profile.bio || "";
  byId("profileGoal").value = String([15, 30, 45, 60].includes(Number(profile.dailyGoal)) ? Number(profile.dailyGoal) : 15);
  byId("profileLevel").value = profile.pythonLevel || "Beginner";
  byId("profileDisplayHeading").textContent = name;
  byId("profileJoined").textContent = user.metadata?.creationTime
    ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(user.metadata.creationTime))
    : "PYTHEN learner";
  const providers = (user.providerData || []).map((entry) => entry.providerId === "google.com" ? "Google" : entry.providerId === "password" ? "Email and password" : entry.providerId);
  byId("profileProvider").textContent = providers.join(", ") || "Account sign-in";
  renderSidebarAvatar(selectedPhotoData, name);
  renderProfilePhoto(selectedPhotoData, name);

}

async function saveProfile(event) {
  event.preventDefault();
  if (!currentUser || !profileDb || !profileSdk) return;
  const displayName = byId("profileName").value.trim();
  if (!displayName) {
    setProfileMessage("Add a display name before saving.", true);
    byId("profileName").focus();
    return;
  }
  const button = byId("saveProfile");
  button.disabled = true;
  setProfileMessage("Saving your profile…");
  try {
    const { doc, setDoc, serverTimestamp } = profileSdk;
    await setDoc(doc(profileDb, "users", currentUser.uid), {
      displayName,
      bio: byId("profileBio").value.trim(),
      dailyGoal: Number(byId("profileGoal").value),
      pythonLevel: byId("profileLevel").value,
      photoDataUrl: selectedPhotoData || null,
      photoRemoved: photoRemoved && !selectedPhotoData,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    const { updateProfile } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js");
    await updateProfile(currentUser, { displayName });
    byId("sidebarName").textContent = displayName;
    byId("welcomeName").textContent = displayName;
    byId("profileDisplayHeading").textContent = displayName;
    renderSidebarAvatar(selectedPhotoData, displayName);
    renderProfilePhoto(selectedPhotoData, displayName);
    setProfileMessage("Profile saved.");
  } catch (error) {
    setProfileMessage(error.message || "Could not save your profile. Try again.", true);
  } finally {
    button.disabled = false;
  }
}

async function showApp(user) {
  currentUser = user;
  screen.hidden = true;
  appView.hidden = false;
  const name = user.displayName?.trim() || user.email?.split("@")[0] || "Learner";
  byId("welcomeName").textContent = name;
  byId("sidebarName").textContent = name;
  byId("sidebarEmail").textContent = user.email || "Signed in";
  renderSidebarAvatar("", name);
  byId("currentDate").textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "long", day: "numeric",
  }).format(new Date()).toUpperCase();
  try {
    await initializeProfile(user);
  } catch (error) {
    setProfileMessage(error.message || "Profile details could not load.", true);
    console.error("Profile could not load:", error);
  }
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
  googleButton.hidden = false;
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
  googleButton.hidden = true;
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
    "auth/operation-not-allowed": "This sign-in method is not enabled in Firebase yet. Enable it under Authentication → Sign-in method.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled. Try again when you’re ready.",
    "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.",
    "auth/cancelled-popup-request": "A Google sign-in window is already open. Finish or close it before trying again.",
    "auth/account-exists-with-different-credential": "This Google email already has an email-and-password account. Sign in with that method instead.",
    "auth/credential-already-in-use": "This Google account is already linked to a different PYTHEN account.",
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
  googleButton.disabled = busy || !auth;
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

googleButton.addEventListener("click", async () => {
  setError();
  if (!auth || googleButton.disabled) return;
  googleButton.disabled = true;
  googleButton.setAttribute("aria-busy", "true");
  try {
    const { GoogleAuthProvider, signInWithPopup } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js");
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    setError(friendlyError(error));
  } finally {
    googleButton.disabled = false;
    googleButton.removeAttribute("aria-busy");
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
    googleButton.disabled = false;
  } catch (error) {
    setupNotice.hidden = false;
    setupNotice.textContent = "Could not connect to Firebase. Check the web config, Email/Password provider, authorized domain, and network, then reload this page.";
    submitButton.disabled = true;
    for (const input of form.querySelectorAll("input")) input.disabled = true;
    signInTab.disabled = true;
    signUpTab.disabled = true;
    byId("forgotPassword").disabled = true;
    googleButton.disabled = true;
    console.error("Firebase initialization failed:", error);
  }
}

startFirebase();

