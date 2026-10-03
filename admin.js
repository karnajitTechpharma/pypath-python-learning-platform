const firestoreUrl = "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
const $ = (id) => document.getElementById(id);
let db;
let firestore;
let currentUser;
let editingId = "";
let messageTimer;

function safeLink(value) {
  try {
    const url = new URL(value);
    return ["youtube.com", "www.youtube.com", "youtu.be", "www.youtu.be"].includes(url.hostname) && url.protocol === "https:";
  } catch {
    return false;
  }
}

function showMessage(message, isError = false) {
  const status = $("adminStatus");
  status.textContent = message;
  status.dataset.error = String(isError);
  clearTimeout(messageTimer);
  if (!isError) messageTimer = setTimeout(() => { status.textContent = ""; }, 3500);
}

function createLessonCard(id, lesson, adminMode) {
  const card = document.createElement("article");
  card.className = "lesson-card";
  const title = document.createElement("h3");
  title.textContent = lesson.title || "Untitled lesson";
  const meta = document.createElement("p");
  meta.className = "lesson-meta";
  meta.textContent = `${lesson.topic || "Python"} · ${lesson.videoMinutes || 5} min · ${lesson.published ? "Published" : "Draft"}`;
  const notes = document.createElement("p");
  notes.textContent = lesson.notes || "No notes added.";
  const video = document.createElement("a");
  if (safeLink(lesson.videoUrl || "")) {
    video.href = lesson.videoUrl;
    video.target = "_blank";
    video.rel = "noopener noreferrer";
    video.textContent = "Watch lesson video";
  } else {
    video.textContent = "Video link unavailable";
    video.setAttribute("aria-disabled", "true");
  }
  card.append(title, meta, notes, video);
  if (lesson.quiz?.question && Array.isArray(lesson.quiz.options)) {
    const quiz = document.createElement("div");
    quiz.className = "lesson-quiz";
    const question = document.createElement("p");
    question.textContent = lesson.quiz.question;
    quiz.append(question);
    const result = document.createElement("p");
    result.className = "lesson-quiz-result";
    result.setAttribute("aria-live", "polite");
    lesson.quiz.options.forEach((option, index) => {
      const answer = document.createElement("button");
      answer.type = "button";
      answer.className = "answer";
      answer.textContent = option;
      answer.addEventListener("click", () => {
        result.textContent = index === lesson.quiz.correctIndex ? "Correct!" : "Try again.";
        result.style.color = index === lesson.quiz.correctIndex ? "#2c6639" : "#a24d35";
      });
      quiz.append(answer);
    });
    quiz.append(result);
    card.append(quiz);
  }
  if (adminMode) {
    const actions = document.createElement("div");
    actions.className = "admin-item-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "textbtn";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => populateForm(id, lesson));
    const publish = document.createElement("button");
    publish.type = "button";
    publish.className = "textbtn";
    publish.textContent = lesson.published ? "Unpublish" : "Publish";
    publish.addEventListener("click", () => togglePublished(id, !lesson.published));
    actions.append(edit, publish);
    card.append(actions);
  }
  return card;
}

async function loadLessons() {
  const studentList = $("publishedLessonList");
  const adminList = $("adminLessonList");
  studentList.replaceChildren();
  adminList.replaceChildren();
  const published = await firestore.getDocs(firestore.query(
    firestore.collection(db, "courses"), firestore.where("published", "==", true),
  ));
  const lessons = published.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
  lessons.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  $("publishedStatus").textContent = lessons.length ? `${lessons.length} lesson${lessons.length === 1 ? "" : "s"} available` : "No lessons have been published yet.";
  for (const lesson of lessons) studentList.append(createLessonCard(lesson.id, lesson, false));
  if (adminList) {
    const all = await firestore.getDocs(firestore.collection(db, "courses"));
    const allLessons = all.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
    allLessons.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    if (!allLessons.length) adminList.textContent = "No lessons yet. Add the first lesson above.";
    for (const lesson of allLessons) adminList.append(createLessonCard(lesson.id, lesson, true));
  }
}

function populateForm(id, lesson) {
  editingId = id;
  $("lessonId").value = id;
  $("lessonTitle").value = lesson.title || "";
  $("lessonTopic").value = lesson.topic || "";
  $("lessonVideoUrl").value = lesson.videoUrl || "";
  $("lessonVideoMinutes").value = lesson.videoMinutes || 5;
  $("lessonNotes").value = lesson.notes || "";
  $("lessonQuestion").value = lesson.quiz?.question || "";
  $("lessonAnswer0").value = lesson.quiz?.options?.[0] || "";
  $("lessonAnswer1").value = lesson.quiz?.options?.[1] || "";
  $("lessonAnswer2").value = lesson.quiz?.options?.[2] || "";
  $("lessonCorrect").value = String(lesson.quiz?.correctIndex ?? 0);
  $("lessonPublished").checked = Boolean(lesson.published);
  $("saveLesson").textContent = "Update lesson";
  $("cancelLessonEdit").hidden = false;
  $("lessonTitle").focus();
}

function resetForm() {
  editingId = "";
  $("lessonForm").reset();
  $("lessonId").value = "";
  $("lessonVideoMinutes").value = "5";
  $("lessonPublished").checked = true;
  $("saveLesson").textContent = "Save lesson";
  $("cancelLessonEdit").hidden = true;
}

async function togglePublished(id, published) {
  try {
    await firestore.updateDoc(firestore.doc(db, "courses", id), {
      published,
      updatedAt: firestore.serverTimestamp(),
      updatedBy: currentUser.uid,
    });
    await loadLessons();
    showMessage(published ? "Lesson published." : "Lesson unpublished.");
  } catch (error) {
    showMessage(error.message || "Could not update lesson status.", true);
  }
}

async function saveLesson(event) {
  event.preventDefault();
  const videoUrl = $("lessonVideoUrl").value.trim();
  if (!safeLink(videoUrl)) {
    showMessage("Use a valid HTTPS YouTube or youtu.be link.", true);
    $("lessonVideoUrl").focus();
    return;
  }
  const lesson = {
    title: $("lessonTitle").value.trim(),
    topic: $("lessonTopic").value.trim(),
    videoUrl,
    videoMinutes: Number($("lessonVideoMinutes").value),
    notes: $("lessonNotes").value.trim(),
    quiz: {
      question: $("lessonQuestion").value.trim(),
      options: [$("lessonAnswer0").value.trim(), $("lessonAnswer1").value.trim(), $("lessonAnswer2").value.trim()],
      correctIndex: Number($("lessonCorrect").value),
    },
    published: $("lessonPublished").checked,
    updatedAt: firestore.serverTimestamp(),
    updatedBy: currentUser.uid,
  };
  const button = $("saveLesson");
  button.disabled = true;
  try {
    if (editingId) {
      await firestore.updateDoc(firestore.doc(db, "courses", editingId), lesson);
    } else {
      await firestore.addDoc(firestore.collection(db, "courses"), {
        ...lesson,
        createdAt: firestore.serverTimestamp(),
        createdBy: currentUser.uid,
      });
    }
    resetForm();
    await loadLessons();
    showMessage("Lesson saved.");
  } catch (error) {
    showMessage(error.message || "Could not save lesson. Check Firestore setup and rules.", true);
  } finally {
    button.disabled = false;
  }
}

export async function initializeAdminPanel(app, user) {
  currentUser = user;
  firestore = await import(firestoreUrl);
  db = firestore.getFirestore(app);
  const marker = await firestore.getDoc(firestore.doc(db, "admins", user.uid));
  const isAdmin = marker.exists();
  $("adminNav").hidden = !isAdmin;
  $("adminPanel").hidden = !isAdmin;
  if (isAdmin && !$("lessonForm").dataset.bound) {
    $("lessonForm").addEventListener("submit", saveLesson);
    $("cancelLessonEdit").addEventListener("click", resetForm);
    $("lessonForm").dataset.bound = "true";
  }
  $("adminNav").onclick = () => $("adminPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  if (!$("adminPanel").hidden) $("adminStatus").textContent = "Your administrator access is active.";
  await loadLessons();
}

