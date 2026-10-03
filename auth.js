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
let resendCooldownTimer;
const verificationActionSettings = {
  url: "https://karnajittechpharma.github.io/pythen-learning-platform/",
  handleCodeInApp: false,
};

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
let selectedAvatarEmoji = "👤";
let photoRemoved = false;

function renderSidebarAvatar(photo, name, avatarEmoji = "") {
  const avatar = byId("userAvatar");
  if (!avatar) return;
  avatar.replaceChildren();
  if (photo) {
    const image = document.createElement("img");
    image.src = photo;
    image.alt = "";
    avatar.append(image);
  } else {
    avatar.textContent = avatarEmoji || (name || "Learner").trim().slice(0, 1).toUpperCase() || "👤";
  }
}

function renderProfilePhoto(photo, name, avatarEmoji = "") {
  const image = byId("profilePhoto");
  const initial = byId("profileInitial");
  if (!image || !initial) return;
  image.hidden = !photo;
  initial.hidden = Boolean(photo);
  if (photo) image.src = photo;
  else initial.textContent = avatarEmoji || (name || "Learner").trim().slice(0, 1).toUpperCase() || "👤";
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

function renderAvatarChoices() {
  document.querySelectorAll(".avatar-choice").forEach((choice) => {
    choice.setAttribute("aria-pressed", String(choice.dataset.avatar === selectedAvatarEmoji));
  });
}

function updateGenderField() {
  const selfDescribing = byId("profileGender").value === "Self-described";
  byId("profileGenderDetailLabel").hidden = !selfDescribing;
  byId("profileGenderDetail").required = false;
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
      renderSidebarAvatar("", byId("profileName").value, selectedAvatarEmoji);
      renderProfilePhoto("", byId("profileName").value, selectedAvatarEmoji);
      setProfileMessage("Photo removed. Save changes to keep it removed.");
    });
    document.querySelectorAll(".avatar-choice").forEach((choice) => {
      choice.addEventListener("click", () => {
        selectedAvatarEmoji = choice.dataset.avatar || "👤";
        selectedPhotoData = "";
        photoRemoved = true;
        renderAvatarChoices();
        renderSidebarAvatar("", byId("profileName").value, selectedAvatarEmoji);
        renderProfilePhoto("", byId("profileName").value, selectedAvatarEmoji);
        setProfileMessage("Avatar selected. Save changes to keep it.");
      });
    });
    byId("profileGender").addEventListener("change", updateGenderField);
    byId("profilePhotoFile").addEventListener("change", async (event) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) return;
      setProfileMessage("Preparing your photo…");
      try {
        selectedPhotoData = await compressProfilePhoto(file);
        photoRemoved = false;
        renderSidebarAvatar(selectedPhotoData, byId("profileName").value, selectedAvatarEmoji);
        renderProfilePhoto(selectedPhotoData, byId("profileName").value, selectedAvatarEmoji);
        renderAvatarChoices();
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
  selectedAvatarEmoji = profile.avatarEmoji || "👤";
  selectedPhotoData = profile.photoDataUrl || (!photoRemoved ? user.photoURL || "" : "");
  byId("profileName").value = name;
  byId("profileEmail").value = user.email || "";
  byId("profileBio").value = profile.bio || "";
  byId("profileGoal").value = String([15, 30, 45, 60].includes(Number(profile.dailyGoal)) ? Number(profile.dailyGoal) : 15);
  byId("profileLevel").value = profile.pythonLevel || "Beginner";
  byId("profileGender").value = profile.gender || "";
  byId("profileGenderDetail").value = profile.genderDetail || "";
  updateGenderField();
  renderAvatarChoices();
  byId("profileDisplayHeading").textContent = name;
  byId("profileJoined").textContent = user.metadata?.creationTime
    ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(user.metadata.creationTime))
    : "PYTHEN learner";
  const providers = (user.providerData || []).map((entry) => entry.providerId === "google.com" ? "Google" : entry.providerId === "password" ? "Email and password" : entry.providerId);
  byId("profileProvider").textContent = providers.join(", ") || "Account sign-in";
  renderSidebarAvatar(selectedPhotoData, name, selectedAvatarEmoji);
  renderProfilePhoto(selectedPhotoData, name, selectedAvatarEmoji);

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
      gender: byId("profileGender").value,
      genderDetail: byId("profileGender").value === "Self-described" ? byId("profileGenderDetail").value.trim() : "",
      avatarEmoji: selectedAvatarEmoji,
      photoDataUrl: selectedPhotoData || null,
      photoRemoved: photoRemoved && !selectedPhotoData,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    const { updateProfile } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js");
    await updateProfile(currentUser, { displayName });
    byId("sidebarName").textContent = displayName;
    byId("welcomeName").textContent = displayName;
    byId("profileDisplayHeading").textContent = displayName;
    renderSidebarAvatar(selectedPhotoData, displayName, selectedAvatarEmoji);
    renderProfilePhoto(selectedPhotoData, displayName, selectedAvatarEmoji);
    renderAvatarChoices();
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

function startResendCooldown(seconds = 60) {
  const button = byId("resendVerification");
  clearInterval(resendCooldownTimer);
  let remaining = seconds;
  button.disabled = true;
  button.textContent = "Resend email in " + remaining + "s";
  resendCooldownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(resendCooldownTimer);
      resendCooldownTimer = null;
      button.disabled = false;
      button.textContent = "Resend verification email";
    } else {
      button.textContent = "Resend email in " + remaining + "s";
    }
  }, 1000);
}
function showVerification(user, message = "") {
  currentUser = user;
  appView.hidden = true;
  screen.hidden = false;
  byId("authTabs").hidden = true;
  form.hidden = true;
  byId("authFoot").hidden = true;
  verifyNotice.hidden = false;
  googleButton.hidden = true;
  byId("signedInNotice").hidden = false;
  byId("signedInNotice").textContent = message || "Verify your email address to unlock lessons. Open PYTHEN’s latest verification email, or request another one below. Check Spam/Junk and Promotions if it is not in your inbox.";
  startResendCooldown();
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
    "auth/too-many-requests": "Firebase is temporarily limiting requests. Wait a few minutes before trying again.",
    "auth/quota-exceeded": "Firebase has reached its email sending limit for now. Try again later.",
    "auth/invalid-continue-uri": "The verification return address is not configured in Firebase. Contact the site administrator.",
    "auth/unauthorized-continue-uri": "The verification return address must be added to Firebase’s authorized domains. Contact the site administrator.",
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
      const user = credential.user;

      // Clear credentials as soon as Firebase creates the account. A later email
      // delivery error must never send the learner back to account creation.
      passwordInput.value = "";
      confirmInput.value = "";
      showVerification(user, "Your account is created. Firebase is requesting the verification email…");

      try {
        await sendEmailVerification(user, verificationActionSettings);
        showVerification(user, `Firebase accepted a verification email request for ${user.email || "your address"}. It can take a few minutes; check Spam/Junk and Promotions if it is not in your inbox.`);
      } catch (verificationError) {
        showVerification(user, "Your account is created, but Firebase could not confirm the verification email request. Wait for the resend button, then try again. Do not create another account.");
        setError(`Your account is already created. ${friendlyError(verificationError)} Use Resend verification email when it becomes available.`);
      }

      // A display-name update is helpful but optional; it must not block email
      // verification or hide the account from the learner.
      try {
        await updateProfile(user, { displayName: nameInput.value.trim() });
      } catch (profileError) {
        console.warn("Account created; display name update could not complete:", profileError);
      }
    } else {
      await signInWithEmailAndPassword(auth, email, passwordInput.value);
      passwordInput.value = "";
      confirmInput.value = "";
    }
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
  if (!currentUser || byId("resendVerification").disabled) return;
  byId("resendVerification").disabled = true;
  byId("resendVerification").textContent = "Sending…";
  try {
    const { sendEmailVerification } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js");
    await sendEmailVerification(currentUser, verificationActionSettings);
    byId("signedInNotice").textContent = "Firebase accepted a new verification email request for " + (currentUser.email || "your address") + ". Check Spam/Junk and Promotions if it is not in your inbox.";
    startResendCooldown();
  } catch (error) {
    setError(`Your account is already created. Firebase could not confirm the resend request. ${friendlyError(error)} Check your inbox and Spam/Junk for the latest message before retrying.`);
    if (error?.code === "auth/too-many-requests" || error?.code === "auth/quota-exceeded") {
      startResendCooldown(120);
    } else {
      byId("resendVerification").disabled = false;
      byId("resendVerification").textContent = "Resend verification email";
    }
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

