"use strict"

let documentoCorrente
let testoEstratto
let flashcardGlobal = []
let quizGlobal = []
let currentIndex = 0;
let isFlipped = false;
let viewMode = "single";
let dataToSave
const googleClientId = "99632147794-fuhq76pci5hk7dh2uglkeddcs7fjqjpc.apps.googleusercontent.com";

// ============================================
// AI TUTOR - VARIABILI GLOBALI
// ============================================
let chatHistory = [];

// ============================================
// Mobile Menu Toggle
// ============================================
mobileMenuBtn.addEventListener('click', () => {
  mobileMenu.classList.toggle('hidden');
});

// ============================================
// Navbar Scroll Effect
// ============================================
let lastScroll = 0;
window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset;
  if (currentScroll > 100) {
    navbar.classList.add('shadow-lg');
  } else {
    navbar.classList.remove('shadow-lg');
  }
  lastScroll = currentScroll;
});

// ============================================
// Smooth Scroll for Anchor Links
// ============================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    if (href !== '#' && href !== '#demo') {
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        mobileMenu.classList.add('hidden');
      }
    }
  });
});

// ============================================
// Intersection Observer for Animations
// ============================================
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('animate-slide-up');
    }
  });
}, observerOptions);
document.querySelectorAll('section').forEach(section => {
  observer.observe(section);
});

// ============================================
// FILE SELECTION
// ============================================
selectFileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    handleFile(file);
    homepage.classList.add("hidden");
    sezioneResults.classList.remove("hidden");
    loadingSection.classList.remove("hidden")
    divElaborazioneCompletata.classList.remove("inline-flex");
    divElaborazioneCompletata.classList.add("hidden");
    divCreazione.classList.add("hidden");
    divFlashcard.classList.add("hidden");
    divQuiz.classList.add("hidden");
    divTutorAi.classList.add("hidden");
    buttons.classList.add("hidden");
    nomeDocumento.classList.add("hidden")
  }
});

// ============================================
// DRAG & DROP
// ============================================
dropZone.addEventListener("click", () => {
  fileInput.click();
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("border-blue-500", "bg-blue-50", "scale-105");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("border-blue-500", "bg-blue-50", "scale-105");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("border-blue-500", "bg-blue-50", "scale-105");
  const file = e.dataTransfer.files[0];
  if (file) {
    handleFile(file);
    homepage.classList.add("hidden");
    sezioneResults.classList.remove("hidden");
  }
});

// ============================================
// UI HELPERS — progress bar e steps
// ============================================
const STEP_BASE = 'flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm font-medium transition-all duration-400';
const ICON_BASE = 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all duration-400';

function setStatus(msg) {
  const statusEl = document.getElementById('statusMsg');
  if (!statusEl) return;
  statusEl.style.animation = 'none';
  statusEl.offsetHeight;
  statusEl.style.animation = 'status-change .35s ease both';
  statusEl.textContent = msg;
}

function updateBar(pct) {
  const pctEl  = document.getElementById('pct');
  const barFill = document.querySelector('.bar-fill');

  if (pctEl)   pctEl.textContent = pct + '%';
  if (barFill) {
    barFill.style.animation  = 'bar-sheen 1.8s linear infinite';
    barFill.style.width      = pct + '%';
    barFill.style.transition = 'width 0.6s cubic-bezier(.4,0,.2,1)';
  }
}

function activateStep(stepNumber) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById('s'  + i);
    const ic = document.getElementById('si' + i);
    if (!el || !ic) continue;

    if (i < stepNumber) {
      el.className = `step-done ${STEP_BASE}`;
      ic.className = `icon-done ${ICON_BASE}`;
      ic.textContent = '✓';
    } else if (i === stepNumber) {
      el.className = `step-active ${STEP_BASE}`;
      ic.className = `icon-active icon-active-pulse ${ICON_BASE}`;
      ic.textContent = '●';
    } else {
      el.className = `step-idle ${STEP_BASE}`;
      ic.className = `icon-idle ${ICON_BASE}`;
      ic.textContent = String(i);
    }
  }
}

function showDone() {
  const dotLoader = document.getElementById('dotLoader');
  if (dotLoader) dotLoader.style.display = 'none';
  setStatus('Tutto pronto · Buono studio 🚀');
  const statusEl = document.getElementById('statusMsg');
  if (statusEl) {
    statusEl.style.color      = '#6366f1';
    statusEl.style.fontWeight = '500';
  }
}

// ============================================
// FILE HANDLING — con SSE reale
// ============================================
async function handleFile(file) {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
  if (!allowedTypes.includes(file.type)) {
    alert('❌ Tipo file non supportato. Usa PDF, JPG o PNG');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    alert('❌ File troppo grande. Massimo 10MB');
    return;
  }

  documentTitle.textContent = file.name;

  updateBar(0);
  activateStep(1);
  setStatus('Avvio elaborazione...');

  const formData = new FormData();
  formData.append('file', file);
  documentoCorrente = formData

  let response;
  try {
    response = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });
  } catch (err) {
    alert("❌ Errore di rete: " + err.message);
    return;
  }

  if (!response.ok) {
    alert("❌ Errore server: " + response.status);
    return;
  }

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;

      let data;
      try {
        data = JSON.parse(line.slice(6));
      } catch {
        continue;
      }

      if (data.error) {
        alert("❌ " + data.error);
        return;
      }

      if (data.pct  !== undefined) updateBar(data.pct);
      if (data.msg  !== undefined) setStatus(data.msg);
      if (data.step !== undefined) activateStep(data.step);

      if (data.done) {
        try {
          const flashcards = JSON.parse(data.flashcard);
          console.log(flashcards)
          flashcardGlobal = flashcards
          const quiz = JSON.parse(data.quiz);
          quizGlobal = quiz
          testoEstratto = data.extractedText

          showDone();
          updateBar(100);
          activateStep(5);

          divElaborazioneCompletata.classList.remove("hidden");
          divElaborazioneCompletata.classList.add("inline-flex");
          divCreazione.classList.remove("hidden");
          divFlashcard.classList.remove("hidden");
          divQuiz.classList.remove("hidden");
          divTutorAi.classList.remove("hidden");
          buttons.classList.remove("hidden");
          buttons.classList.add("flex");
          flashcardCount.textContent = flashcards.length;
          quizCount.textContent = quiz.length
          loadingSection.classList.add("hidden")
          nomeDocumento.classList.remove("hidden")
          results.classList.remove("py-10")
          results.classList.add("py-16")
        } catch (parseErr) {
          alert("❌ Errore nel parsing dei risultati: " + parseErr.message);
        }
        return;
      }
    }
  }
}

// ============================================
// BUTTONS
// ============================================

scaricaQuizFlashcards.addEventListener("click", scaricaTutto);

showFlashcard.addEventListener("click", function() {
    sezioneResults.classList.add("hidden");
    flashcardsSection.classList.remove("hidden");
    
    caricaDatiFlashcard()
});

btnStudio.addEventListener("click", function() {
    singleView.classList.remove("hidden");
    gridView.classList.add("hidden");
    
    btnStudio.classList.add("bg-indigo-600", "text-white");
    btnStudio.classList.remove("bg-white", "border-2", "border-gray-300", "text-gray-700");
    
    btnGrid.classList.remove("bg-indigo-600", "text-white");
    btnGrid.classList.add("bg-white", "border-2", "border-gray-300", "text-gray-700");
});

btnGrid.addEventListener("click", function() {
    singleView.classList.add("hidden");
    gridView.classList.remove("hidden");
    gridView.classList.add("grid")
    
    btnGrid.classList.add("bg-indigo-600", "text-white");
    btnGrid.classList.remove("bg-white", "border-2", "border-gray-300", "text-gray-700");
    
    btnStudio.classList.remove("bg-indigo-600", "text-white");
    btnStudio.classList.add("bg-white", "border-2", "border-gray-300", "text-gray-700");
    
    renderGridView();
});

nextFlashcard.addEventListener("click", function() {
    isFlipped = false;
    currentIndex = (currentIndex + 1) % flashcardGlobal.length;
    renderCard();
    currentNum.textContent = currentIndex + 1;
});

prevFlashcard.addEventListener("click", function() {
    isFlipped = false;
    currentIndex = (currentIndex - 1 + flashcardGlobal.length) % flashcardGlobal.length;
    renderCard();
    currentNum.textContent = currentIndex + 1;
});

goToQuiz.addEventListener("click",function(){
    flashcardsSection.classList.add("hidden")
    quizSection.classList.remove("hidden")
    caricaDatiQuiz()
})

showQuiz.addEventListener("click",function(){
    sezioneResults.classList.add("hidden");
    quizSection.classList.remove("hidden")
    caricaDatiQuiz()
})

backToFlashcards.addEventListener("click",function(){
    quizSection.classList.add("hidden")
    flashcardsSection.classList.remove("hidden")
})

// ============================================
// AI TUTOR - NAVIGATION
// ============================================

showAiTutor.addEventListener("click", function() {
    sezioneResults.classList.add("hidden");
    aiTutorSection.classList.remove("hidden");
    
    if (chatHistory.length === 0) {
        showSuggestedQuestions();
    }
});

goToAI.addEventListener("click", function() {
    flashcardsSection.classList.add("hidden");
    aiTutorSection.classList.remove("hidden");
    
    if (chatHistory.length === 0) {
        showSuggestedQuestions();
    }
});

goToAIFromQuiz.addEventListener("click", function() {
    quizSection.classList.add("hidden");
    aiTutorSection.classList.remove("hidden");
    
    if (chatHistory.length === 0) {
        showSuggestedQuestions();
    }
});

/*backToResultsFromAI.addEventListener("click", function() {
    backToResultsFromAIFunction("sezioneResults")
});*/

showSectionStartNav.addEventListener("click",function(){
    homepage.classList.add("hidden")
    authSection.classList.remove("hidden")
})

showSectionStartMobile.addEventListener("click",function(){
    homepage.classList.add("hidden")
    onboardingSection.classList.remove("hidden")
})

showSectionStart.addEventListener("click",function(){
    homepage.classList.add("hidden")
    onboardingSection.classList.remove("hidden")
})

showSectionStartLink.addEventListener("click",function(){
    homepage.classList.add("hidden")
    onboardingSection.classList.remove("hidden")
})

showSectionStartCta.addEventListener("click",function(){
    homepage.classList.add("hidden")
    onboardingSection.classList.remove("hidden")
})

showSectionStartCtaTwo.addEventListener("click",function(){
    homepage.classList.add("hidden")
    onboardingSection.classList.remove("hidden")
})

showHidePsw.addEventListener("click",function(){
    if(loginPassword.type == "password"){
        eyeShowPsw.classList.add("hidden")
        eyeHidePsw.classList.remove("hidden")
        loginPassword.type = "text"
    }
    else{
        eyeShowPsw.classList.remove("hidden")
        eyeHidePsw.classList.add("hidden")
        loginPassword.type = "password"
    }
})

showHidePswSignup.addEventListener("click",function(){
    if(signupPassword.type == "password"){
    eyeShowPswSignUp.classList.add("hidden")
    eyeHidePswSignUp.classList.remove("hidden")
    signupPassword.type = "text"
}
else{
    eyeShowPswSignUp.classList.remove("hidden")
    eyeHidePswSignUp.classList.add("hidden")
    signupPassword.type = "password"
}
})

function backToResultsFromAIFunction(sezione){
    aiTutorSection.classList.add("hidden");
    console.log(sezione)
    if(sezione == "sezioneResults")
        sezioneResults.classList.remove("hidden");
    else
        resultsPage.classList.remove("hidden")
}

async function handleLogin(event){
    event.preventDefault()
    const httResponse = await inviaRichiesta("POST","/login",{"username":loginEmail.value,"password":loginPassword.value})
        if(httResponse.status == 200){
            console.log(httResponse.data)
            authSection.classList.add("hidden")
            dashboard.classList.remove("hidden")
            spanIniziale.textContent = httResponse.data.nome[0].toUpperCase()
        }
        else{
            if(httResponse.status == 401)
                msgErroreLogin.classList.remove("hidden")
            else
                alert(httResponse.status + " : " + httResponse.err)
        }
}

async function handleSignup(event){
    event.preventDefault()
    const httResponse = await inviaRichiesta("POST","/registrazione",{"nome":signupName.value,"password":loginPassword.value,
        "email":signupEmail.value
    })
        if(httResponse.status == 200){
            console.log(httResponse.data)
            authSection.classList.add("hidden")
            dashboard.classList.remove("hidden")
            spanIniziale.textContent = httResponse.data.nome[0].toUpperCase()
            dataToSave["userId"] = httResponse.data._id
            const responseSavement = await inviaRichiesta("POST","/saveStudyData",dataToSave)
            if(responseSavement.status == 200){
                console.log(responseSavement.data)
                const getPlanResponse = await inviaRichiesta("GET","/getPlan",{"id":apiResponse.data._id})
                if(getPlanResponse.status == 200){
                    console.log(getPlanResponse.data)
                    populateDashboard(getPlanResponse.data)
                }
                else
                    console.log("Errore: " ,getPlanResponse.err)

            }
            else
                console.log("Errore: " ,responseSavement.err)
        }
        else{
            if(httResponse.status == 400)
                msgErroreRegistrazione.classList.remove("hidden")
            else
                console.log(httResponse.status + " : " + httResponse.err)
        }
}

// ============================================
// AI TUTOR - SUGGESTED QUESTIONS
// ============================================

function showSuggestedQuestions() {
    suggestedQuestions.classList.remove('hidden');
    chatMessages.classList.add('hidden');
}

function hideSuggestedQuestions() {
    suggestedQuestions.classList.add('hidden');
    chatMessages.classList.remove('hidden');
}

document.querySelectorAll('.suggested-question-btn').forEach((btn, index) => {
    btn.addEventListener('click', function() {
        const questions = [
            "Riassumi il documento in modo conciso",
            "Spiega i concetti chiave del documento",
            "Fammi 3 domande per testare la mia comprensione",
            "Crea esempi pratici basati sul documento"
        ];
        sendMessage(questions[index]);
    });
});

// ============================================
// AI TUTOR - CHAT FORM
// ============================================

const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const charCount = document.getElementById('charCount');

chatForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const message = chatInput.value.trim();
    if (!message) return;
    
    sendMessage(message);
    
    chatInput.value = '';
    chatInput.style.height = 'auto';
    updateCharCount();
    updateSendButton();
});

chatInput.addEventListener('input', function() {
    updateCharCount();
    updateSendButton();
    autoResize();
});

chatInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        
        if (chatInput.value.trim()) {
            chatForm.dispatchEvent(new Event('submit'));
        }
    }
});

function updateCharCount() {
    const count = chatInput.value.length;
    charCount.textContent = count;
    
    if (count > 2000) {
        charCount.classList.add('text-red-500');
    } else {
        charCount.classList.remove('text-red-500');
    }
}

function updateSendButton() {
    const hasText = chatInput.value.trim().length > 0;
    sendBtn.disabled = !hasText;
}

function autoResize() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 128) + 'px';
}

// ============================================
// AI TUTOR - SEND MESSAGE
// ============================================

async function sendMessage(message) {
    console.log('📤 Sending:', message.substring(0, 50));
    
    if (!suggestedQuestions.classList.contains('hidden')) {
        hideSuggestedQuestions();
    }
    
    addUserMessage(message);
    showTypingIndicator();
    scrollToBottom();
    
    try {
        const response = await inviaRichiesta('POST', '/chat', {
            prompt: message,
            testoDocumento: testoEstratto || ""
        });
        
        hideTypingIndicator();
        
        if (response.status == 200) {
            addAIMessage(response.data.response);
            
            chatHistory.push({
                user: message,
                ai: response.response,
                timestamp: new Date()
            });
            
            console.log('✅ Success');
        } else {
            throw new Error(response.error || 'Unknown error');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        hideTypingIndicator();
        
        let errorMsg = '⚠️ Si è verificato un errore.';
        if (!testoEstratto) {
            errorMsg = '⚠️ Nessun documento caricato.';
        }
        addAIMessage(errorMsg);
    }
    
    scrollToBottom();
}

// ============================================
// AI TUTOR - ADD MESSAGES
// ============================================

function addUserMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex justify-end animate-slide-in-right';
    
    messageDiv.innerHTML = `
        <div class="max-w-3xl">
            <div class="bg-linear-to-r from-indigo-600 to-purple-600 text-white rounded-2xl rounded-tr-none px-5 py-3 shadow-md">
                <p class="text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">${escapeHtml(message)}</p>
            </div>
            <p class="text-xs text-gray-400 mt-1 text-right">${getCurrentTime()}</p>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
}

function addAIMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex items-start gap-3 max-w-3xl animate-slide-in-left';
    
    messageDiv.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-cyan-600 flex items-center justify-center shrink-0">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
            </svg>
        </div>
        
        <div class="flex-1">
            <div class="bg-white rounded-2xl rounded-tl-none px-5 py-3 shadow-sm border border-gray-200">
                ${formatAIMessage(message)}
            </div>
            <p class="text-xs text-gray-400 mt-1">${getCurrentTime()}</p>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
}

function formatAIMessage(text) {
    text = escapeHtml(text);
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
    text = text.replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-indigo-600">$1</code>');
    text = text.replace(/^- (.+)$/gm, '<li class="ml-4 mb-1">• $1</li>');
    text = text.replace(/^\d+\. (.+)$/gm, function(match, content) {
        const num = match.match(/^(\d+)\./)[1];
        return `<li class="ml-4 mb-1"><span class="font-semibold">${num}.</span> ${content}</li>`;
    });
    text = text.replace(/\n/g, '<br>');
    
    return `<div class="prose prose-sm max-w-none text-sm text-gray-800 leading-relaxed">${text}</div>`;
}

// ============================================
// AI TUTOR - HELPERS
// ============================================

function showTypingIndicator() {
    typingIndicator.classList.remove('hidden');
    scrollToBottom();
}

function hideTypingIndicator() {
    typingIndicator.classList.add('hidden');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 100);
}

// ============================================
// FLASHCARD FUNCTIONS
// ============================================

function caricaDatiFlashcard(){
    currentIndex = 0;
    isFlipped = false;
    
    flashcardCountFlashcardSection.textContent = flashcardGlobal.length + " Flashcard Generate";
    totalNum.textContent = flashcardGlobal.length;
    currentNum.textContent = "1";
    
    renderCard();
}

function caricaDatiQuiz() {
    const quizData = quizGlobal;

    let currentQuestion = 0;
    let score = 0;
    let answered = false;

    const questionEl = document.getElementById("quizQuestion");
    const answersEl = document.getElementById("quizAnswers");
    const progressEl = document.getElementById("quizProgress");
    const currentEl = document.getElementById("quizCurrent");
    const totalEl = document.getElementById("quizTotal");
    const feedbackEl = document.getElementById("quizFeedback");
    const resultEl = document.getElementById("quizResult");
    const scoreEl = document.getElementById("quizScore");

    const prevBtn = document.getElementById("prevQuiz");
    const nextBtn = document.getElementById("nextQuiz");
    const retryBtn = document.getElementById("retryQuiz");
    
    if (quizMainCard) quizMainCard.classList.remove("hidden");
    if (resultEl) resultEl.classList.add("hidden");

    console.log(answersEl)

    totalEl.textContent = "/ " + quizData.length;

    function renderQuestion() {

        const q = quizData[currentQuestion];
        console.log(q)

        answered = false;
        feedbackEl.classList.add("hidden");

        questionEl.textContent = q.question;
        currentEl.textContent = currentQuestion + 1;

        const progress = ((currentQuestion + 1) / quizData.length) * 100;
        progressEl.style.width = progress + "%";

        answersEl.innerHTML = "";

        q.options.forEach((answer, index) => {
            const btn = document.createElement("button");
            btn.className =
                "quiz-option hover:cursor-pointer w-full rounded-xl border border-gray-200 bg-white px-6 py-4 text-left text-gray-700 font-medium transition hover:border-purple-500 hover:bg-purple-50";
            btn.textContent = answer;
            console.log(answer)
            btn.onclick = () => {

                if (answered) return;
                answered = true;
                const options = answersEl.querySelectorAll("button");
                options.forEach((b, i) => {

                    if (i === q.correct) {
                        b.classList.add("bg-green-100", "border-green-500");
                    }

                    if (i === index && i !== q.correct) {
                        b.classList.add("bg-red-100", "border-red-500");
                    }
                    b.disabled = true;
                });

                if (index === q.correct) {
                    score++;
                    feedbackEl.textContent = "Risposta corretta ✅";
                    feedbackEl.className =
                        "mt-6 rounded-xl p-4 text-sm font-medium bg-green-100 text-green-700";
                } else {
                    feedbackEl.textContent = "Risposta sbagliata ❌";
                    feedbackEl.className =
                        "mt-6 rounded-xl p-4 text-sm font-medium bg-red-100 text-red-700";
                }
                feedbackEl.classList.remove("hidden");
            };
            console.log(btn)
            answersEl.appendChild(btn);
        });
    }

    nextBtn.onclick = () => {
        if (currentQuestion < quizData.length - 1) {
            currentQuestion++;
            renderQuestion();
        } else {
            showResult();
        }
    };

    prevBtn.onclick = () => {
        if (currentQuestion > 0) {
            currentQuestion--;
            renderQuestion();
        }
    };

    function showResult() {
        document.querySelector(".bg-white.rounded-2xl.shadow-lg.border").classList.add("hidden");
        resultEl.classList.remove("hidden");
        scoreEl.textContent = score + " / " + quizData.length;
    }

    retryBtn.onclick = () => {
        currentQuestion = 0;
        score = 0;
        resultEl.classList.add("hidden");
        document.querySelector(".bg-white.rounded-2xl.shadow-lg.border").classList.remove("hidden");
        renderQuestion();
    };
    renderQuestion();
}

function renderCard() {
    if (flashcardGlobal.length === 0) {
        flashcardView.innerHTML = '<p class="text-center text-gray-500">Nessuna flashcard disponibile</p>';
        return;
    }
    
    const card = flashcardGlobal[currentIndex];
    
    flashcardView.innerHTML = `
    <div id="flashcardContainer" 
         class="relative w-full min-h-72 sm:min-h-80 max-h-80 sm:max-h-96 cursor-pointer transition-transform duration-500" 
         style="transform-style: preserve-3d;">
        
        <div class="card-face absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-indigo-100 bg-linear-to-br from-white to-indigo-50 p-6 sm:p-8 shadow-lg overflow-y-auto" 
             style="backface-visibility: hidden;">
            <div class="text-center w-full">
                <div class="mb-3 sm:mb-4 inline-flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-indigo-100 shrink-0">
                    <svg class="h-5 w-5 sm:h-6 sm:w-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                </div>
                <p id="questionText" class="text-lg sm:text-xl font-medium text-gray-800 leading-relaxed wrap-break-word hyphens-auto px-2">${card.front}</p>
                <p class="mt-3 sm:mt-4 text-xs sm:text-sm text-gray-400 shrink-0">Clicca per vedere la risposta</p>
            </div>
        </div>

        <div class="card-face card-back absolute inset-0 rounded-2xl border-2 border-purple-100 bg-linear-to-br from-indigo-600 to-purple-600 shadow-lg overflow-y-auto" 
             style="backface-visibility: hidden; transform: rotateY(180deg);">
            <div class="p-4 sm:p-6 md:p-8 h-full flex flex-col">
                <div class="flex flex-col items-center justify-center flex-1 min-h-0">
                    <div class="mb-3 sm:mb-4 inline-flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-white/20 shrink-0">
                        <svg class="h-5 w-5 sm:h-6 sm:w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                    <div class="w-full text-center overflow-y-auto flex-1 px-2">
                        <p id="answerText" class="text-sm sm:text-base md:text-lg font-semibold text-white leading-relaxed wrap-break-word hyphens-auto whitespace-pre-wrap">${card.back}</p>
                    </div>
                    <p class="mt-3 sm:mt-4 text-xs sm:text-sm text-white/70 shrink-0">Clicca per tornare alla domanda</p>
                </div>
            </div>
        </div>
    </div>
    `;
    
    const cardContainer = document.getElementById('flashcardContainer');
    if (cardContainer) {
        cardContainer.addEventListener('click', flipCard);
    }
}

function flipCard() {
    const cardContainer = document.getElementById('flashcardContainer');
    if (!cardContainer) return;
    
    isFlipped = !isFlipped;
    
    if (isFlipped) {
        cardContainer.style.transform = "rotateY(180deg)";
    } else {
        cardContainer.style.transform = "rotateY(0deg)";
    }
}

function renderGridView() {
    if (flashcardGlobal.length === 0) {
        gridView.innerHTML = '<p class="text-center text-gray-500">Nessuna flashcard disponibile</p>';
        return;
    }
    
    gridView.innerHTML = '';
    
    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full auto-rows-fr';
    
    flashcardGlobal.forEach((card, index) => {
        const cardElement = document.createElement('div');
        cardElement.className = 'min-w-0 w-full group bg-white rounded-xl border-2 border-gray-200 hover:border-indigo-500 overflow-hidden transition-all cursor-pointer shadow-sm hover:shadow-lg';
        cardElement.onclick = () => openCardModal(index);
        
        cardElement.innerHTML = `
            <div class="bg-linear-to-r from-indigo-500 to-purple-600 px-4 py-3 flex items-center justify-between w-full">
                <span class="text-white font-bold text-sm">Card ${index + 1}</span>
                <svg class="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
            </div>
            
            <div class="p-4 w-full">
                <div class="flex items-start gap-2 mb-3 w-full">
                    <svg class="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <p class="text-sm font-medium text-gray-800 line-clamp-3 flex-1 min-w-0">${card.front}</p>
                </div>
                
                <div class="border-t border-gray-100 pt-3 mt-3 w-full">
                    <div class="flex items-center gap-2 text-xs text-gray-500">
                        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                        </svg>
                        <span>Clicca per vedere la risposta</span>
                    </div>
                </div>
            </div>
        `;
        
        gridContainer.appendChild(cardElement);
    });
    
    gridView.appendChild(gridContainer);
}

function openCardModal(index) {
    const card = flashcardGlobal[index];
    
    const modal = document.createElement('div');
    modal.id = 'cardModal';
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.onclick = (e) => {
        if (e.target === modal) closeCardModal();
    };
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onclick="event.stopPropagation()">
            <div class="bg-linear-to-r from-indigo-500 to-purple-600 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                <h3 class="text-white font-bold text-lg">Flashcard ${index + 1} / ${flashcardGlobal.length}</h3>
                <button onclick="closeCardModal()" class="hover:cursor-pointer text-white hover:bg-white/20 rounded-lg p-2 transition">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
            
            <div class="p-6">
                <div class="mb-6">
                    <div class="flex items-center gap-2 mb-3">
                        <div class="bg-indigo-100 p-2 rounded-lg">
                            <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                        </div>
                        <span class="text-sm font-medium text-gray-500">Domanda</span>
                    </div>
                    <p class="text-lg font-medium text-gray-900 leading-relaxed">${card.front}</p>
                </div>
                
                <div class="border-t border-gray-200 my-6"></div>
                
                <div>
                    <div class="flex items-center gap-2 mb-3">
                        <div class="bg-green-100 p-2 rounded-lg">
                            <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                        </div>
                        <span class="text-sm font-medium text-gray-500">Risposta</span>
                    </div>
                    <p class="text-lg text-gray-800 leading-relaxed">${card.back}</p>
                </div>
            </div>
            
            <div class="bg-gray-50 px-6 py-4 flex gap-3 rounded-b-2xl">
                ${index > 0 ? `
                    <button onclick="closeCardModal(); openCardModal(${index - 1})" class="hover:cursor-pointer flex-1 px-4 py-2 bg-white border-2 border-gray-300 rounded-lg hover:border-indigo-500 transition flex items-center justify-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                        </svg>
                        <span>Precedente</span>
                    </button>
                ` : '<div class="flex-1"></div>'}
                
                ${index < flashcardGlobal.length - 1 ? `
                    <button onclick="closeCardModal(); openCardModal(${index + 1})" class="hover:cursor-pointer flex-1 px-4 py-2 bg-white border-2 border-gray-300 rounded-lg hover:border-indigo-500 transition flex items-center justify-center gap-2">
                        <span>Successiva</span>
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                        </svg>
                    </button>
                ` : '<div class="flex-1"></div>'}
            </div>
        </div>`

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
}

function closeCardModal() {
    const modal = document.getElementById('cardModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
}

if (newUploadBtn) {
  newUploadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInputCore.click();
  });
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function scaricaTutto() {
    console.log('📄 Generando PDF...');
    
    let flashcards = flashcardGlobal;
    let quiz = quizGlobal
    
    if (typeof flashcards === 'string') {
        flashcards = JSON.parse(flashcards);
    }
    if (typeof quiz === 'string') {
        quiz = JSON.parse(quiz);
    }
    
    console.log('✅ Flashcards array:', Array.isArray(flashcards));
    console.log('✅ Quiz array:', Array.isArray(quiz));
    
    if (!flashcards || !quiz) {
        alert('Nessun dato da scaricare!');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    
    let yPosition = 20;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 20;
    const lineHeight = 7;
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('SmartLearn - Materiale di Studio', margin, yPosition);
    yPosition += 15;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generato da: ${documentTitle.textContent}`, margin, yPosition);
    yPosition += 10;
    
    doc.line(margin, yPosition, 190, yPosition);
    yPosition += 10;
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Flashcard', margin, yPosition);
    yPosition += 10;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    if (flashcards && flashcards.length > 0) {
        flashcards.forEach((card, index) => {
            if (yPosition > pageHeight - 40) {
                doc.addPage();
                yPosition = 20;
            }
            
            doc.setFont('helvetica', 'bold');
            doc.text(`${index + 1}.`, margin, yPosition);
            
            doc.setFont('helvetica', 'bold');
            const frontLines = doc.splitTextToSize(`Q: ${card.front}`, 160);
            doc.text(frontLines, margin + 10, yPosition);
            yPosition += frontLines.length * lineHeight;
            
            doc.setFont('helvetica', 'normal');
            const backLines = doc.splitTextToSize(`A: ${card.back}`, 160);
            doc.text(backLines, margin + 10, yPosition);
            yPosition += backLines.length * lineHeight + 5;
        });
    } else {
        doc.text('Nessuna flashcard generata.', margin, yPosition);
        yPosition += 10;
    }
    
    yPosition += 10;
    
    doc.addPage();
    yPosition = 20;
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Quiz', margin, yPosition);
    yPosition += 10;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    if (quiz && quiz.length > 0) {
        quiz.forEach((q, index) => {
            if (yPosition > pageHeight - 60) {
                doc.addPage();
                yPosition = 20;
            }
            
            doc.setFont('helvetica', 'bold');
            const questionLines = doc.splitTextToSize(`${index + 1}. ${q.question}`, 160);
            doc.text(questionLines, margin, yPosition);
            yPosition += questionLines.length * lineHeight + 3;
            
            doc.setFont('helvetica', 'normal');
            q.options.forEach((option, optIndex) => {
                const isCorrect = optIndex === q.correct;
                const prefix = String.fromCharCode(65 + optIndex);
                
                if (isCorrect) {
                    doc.setFont('helvetica', 'bold');
                    doc.text(`${prefix}) ${option} ✓`, margin + 5, yPosition);
                } else {
                    doc.setFont('helvetica', 'normal');
                    doc.text(`${prefix}) ${option}`, margin + 5, yPosition);
                }
                
                yPosition += lineHeight;
            });
            
            yPosition += 5;
        });
    } else {
        doc.text('Nessun quiz generato.', margin, yPosition);
    }
    
    const filename = `SmartLearn_${documentTitle.textContent.replace('.pdf', '')}_${Date.now()}.pdf`;
    doc.save(filename);
    
    console.log('✅ PDF generato:', filename);
}

// ============================================
// ONBOARDING - SMART FLOW
// ============================================

// ============================================
// STEP 0: FILE UPLOAD
// ============================================

const pasteContent = document.getElementById('pasteContent');

// Character counter
if (pasteContent) {
    pasteContent.addEventListener('input', function() {
        const count = this.value.length;
        document.getElementById('charCount').textContent = `${count} caratteri`;
    });
}

// Drag and drop
if (dropZoneCoreSection) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZoneCoreSection.addEventListener(eventName, () => {
            dropZoneCoreSection.classList.add('border-indigo-500', 'bg-indigo-50');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZoneCoreSection.addEventListener(eventName, () => {
            dropZoneCoreSection.classList.remove('border-indigo-500', 'bg-indigo-50');
        });
    });

    dropZoneCoreSection.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });

    dropZoneCoreSection.addEventListener('click', () => {
        fileInputCore.click()
    });

    fileInputCore.addEventListener('change', function() {
        if (this.files.length > 0) {
            handleFileUpload(this.files[0])
        }
    });
}

// Analyze pasted text
function analyzeText() {
    const text = pasteContent.value.trim()
    
    if (text.length < 100) {
        msgMinCaratteri.classList.remove("hidden")
        return
    }
    msgMinCaratteri.classList.add("hidden")
    processContent('text', text);
}

// Handle file upload
function handleFileUpload(file) {
    // Validate
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
        alert('Tipo file non supportato. Usa PDF, JPG o PNG.');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        alert('File troppo grande. Massimo 10MB.');
        return;
    }
    processContent('file', file);
}

// ============================================
// PROCESSING
// ============================================

async function processContent(type, content) {
    // Hide step 0, show processing
    document.getElementById('step0').classList.add('hidden');
    document.getElementById('processingStep').classList.remove('hidden');
    
    const statusEl = document.getElementById('processingStatus');
    const progressEl = document.getElementById('processingProgress');
    const percentageEl = document.getElementById('processingPercentage');
    const updatesEl = document.getElementById('processingUpdates');
    
    try {
        let response;
        
        if (type === 'file') {
            const formData = new FormData();
            formData.append('file', content);
            documentoCorrente = formData
            
            response = await fetch('/api/create-ai-plane', {
                method: 'POST',
                body: formData
            });
        } else {
            // Text paste
            response = await fetch('/api/analyze-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: content })
            });
        }
        
        if (!response.ok) throw new Error('Processing failed');
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
                if (!line.trim() || !line.startsWith('data: ')) continue;
                
                let flashcards
                let quizzes
                try {
                    const data = JSON.parse(line.slice(6));
                    
                    // Update progress
                    if (data.pct !== undefined) {
                        progressEl.style.width = data.pct + '%';
                        percentageEl.textContent = data.pct + '%';
                    }
                    
                    if (data.msg) {
                        statusEl.textContent = data.msg;
                        
                        // Add to live updates
                        const update = document.createElement('div');
                        update.className = 'flex items-center gap-3 p-3 bg-gray-50 rounded-lg animate-fade-in';
                        update.innerHTML = `
                            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                            <span class="text-sm text-gray-700">${data.msg}</span>
                        `;
                        updatesEl.appendChild(update);
                    }
                    
                    if (data.error) {
                        throw new Error(data.error);
                    }
                    
                    if (data.done) {
                        // Save data
                        if (data.flashcard) {
                            flashcards = JSON.parse(data.flashcard);
                        }
                        
                        if (data.quiz) {
                            quizzes = JSON.parse(data.quiz);
                        }
                        
                        processingStep.classList.add("hidden")
                        onboardingSection.classList.add("hidden")
                        resultsPage.classList.remove("hidden")
                        console.log(data)
                        dataToSave = data
                        flashcardGlobal = flashcards
                        quizGlobal = quizzes
                        documentName.textContent = documentoCorrente.get("file").name
                        generatedFlashcard.textContent = flashcards.length
                        generatedQuiz.textContent = quizzes.length
                        generatedCount.textContent = parseInt(flashcards.length) + parseInt(quizzes.length)
                        sideFlashcardCount.textContent = flashcards.length
                        sideQuizCount.textContent = quizzes.length;
                        populateStudyPlan(data.plan)

                    }
                    
                } catch (e) {
                    console.error('Parse error:', e);
                }
            }
        }
        
    } catch (error) {
        console.error('Processing error:', error);
        alert('Errore durante l\'analisi: ' + error.message);
        
        // Reset
        document.getElementById('processingStep').classList.add('hidden');
        document.getElementById('step0').classList.remove('hidden');
    }
}

function populateStudyPlan(data) {
    if (!data) return;

    // TOPICS
    topicCount.textContent = data.topics.length;
    topicsList.textContent = data.topics.join(", ");

    // DIFFICULTY
    difficulty.textContent = data.difficulty;
    difficultyReason.textContent = data.difficultyReason;

    // TIME
    estimatedTime.textContent = data.estimatedTime;

    // RISK
    riskLevel.textContent = data.risk.level;
    riskMessage.textContent = data.risk.message;

    // STRATEGY
    strategy.textContent = data.strategy;

    // STATS
    pagesAnalyzed.textContent = data.stats.pagesAnalyzed;
    keywords.textContent = data.stats.keywords;
    sessions.textContent = data.stats.sessions;
    completion.textContent = data.stats.completion;

    // NEXT ACTION
    nextActionTitleResultsPage.textContent = data.nextAction.title;
    nextActionDescriptionResultsPage.textContent = data.nextAction.description;
    nextActionTimeResultsPage.textContent = data.nextAction.duration;
    nextActionQuestionsResultsPage.textContent = data.nextAction.questions;
    nextActionDifficoltyResultsPage.textContent = data.nextAction.difficulty;

    // TIMELINE
    renderTimeline(data.timeline);
}

function renderTimeline(days) {
    const container = document.getElementById("studyPlanTimeline");
    container.innerHTML = "";

    days.forEach((day, index) => {
        const isFirst = index === 0;
        const borderColor = isFirst ? "border-indigo-500" : "border-gray-300";
        const dotColor = isFirst ? "bg-indigo-500" : "bg-gray-300";

        const html = `
        <div class="relative pl-8 pb-8 border-l-2 ${borderColor}">
            <div class="absolute -left-2.25 top-0 w-4 h-4 ${dotColor} rounded-full border-4 border-white"></div>

            <div class="bg-white rounded-xl p-4 border border-gray-200">
                <div class="flex justify-between mb-2">
                    <span class="text-xs font-bold uppercase">${day.day}</span>
                    <span class="text-xs text-gray-500">${day.duration}</span>
                </div>

                <h3 class="font-semibold">${day.title}</h3>
                <p class="text-sm text-gray-600 mb-2">${day.description}</p>
            </div>
        </div>
        `;

        container.innerHTML += html;
    });
}

// ============================================
// ONBOARDING FLOW
// ============================================

let onboardingData = {
    userType: null,
    subject: null,
    goal: null,
    studyTime: null
};

let currentOnboardingStep = 1;
const totalSteps = 4;

// ============================================
// START ONBOARDING (dal pulsante "Inizia")
// ============================================

function startOnboarding() {
    homepage.classList.add("hidden");
    onboardingSection.classList.remove("hidden");
    currentOnboardingStep = 1;
    updateOnboardingUI();
}

// ============================================
// SELECT OPTION
// ============================================

function selectOption(step, value) {
    console.log(`Step ${step}: ${value}`);
    
    // Salva dati
    switch(step) {
        case 1:
            onboardingData.userType = value;
            break;
        case 2:
            onboardingData.subject = value;
            break;
        case 3:
            onboardingData.goal = value;
            break;
        case 4:
            onboardingData.studyTime = value;
            break;
    }
    
    // Animazione selezione
    const buttons = document.querySelectorAll(`#step${step} button`);
    buttons.forEach(btn => {
        btn.classList.remove('border-indigo-600', 'bg-indigo-50');
    });
    
    event.target.closest('button').classList.add('border-indigo-600', 'bg-indigo-50');
    
    // Aspetta un attimo per mostrare la selezione
    setTimeout(() => {
        if (step < totalSteps) {
            goToStep(step + 1);
        } else {
            completeOnboarding();
        }
    }, 300);
}

// ============================================
// NAVIGATION
// ============================================

function goToStep(stepNumber) {
    currentOnboardingStep = stepNumber;
    
    // Nascondi tutti gli step
    for (let i = 1; i <= totalSteps; i++) {
        document.getElementById(`step${i}`).classList.add('hidden');
    }
    
    // Mostra step corrente con animazione
    const currentStepEl = document.getElementById(`step${stepNumber}`);
    currentStepEl.classList.remove('hidden');
    currentStepEl.style.animation = 'fadeInUp 0.4s ease-out';
    
    updateOnboardingUI();
}

function goBack() {
    if (currentOnboardingStep > 1) {
        goToStep(currentOnboardingStep - 1);
    }
}

function updateOnboardingUI() {
    // Progress bar
    const progress = (currentOnboardingStep / totalSteps) * 100;
    document.getElementById('progressBar').style.width = progress + '%';
    document.getElementById('currentStep').textContent = currentOnboardingStep;
    document.getElementById('progressPercent').textContent = Math.round(progress);
    
    // Back button
    const backBtn = document.getElementById('backBtn');
    if (currentOnboardingStep === 1) {
        backBtn.classList.add('hidden');
    } else {
        backBtn.classList.remove('hidden');
    }
}

function skipOnboarding() {
    completeOnboarding();
}

// ============================================
// COMPLETE ONBOARDING
// ============================================

function completeOnboarding() {
    console.log('✅ Onboarding completato:', onboardingData)
    onboardingSection.classList.add("hidden")
    authSection.classList.remove("hidden")
}

// ============================================
// RESULTS PAGE FUNCTIONS
// ============================================

function startStudying() {
    // Nascondi results, mostra dashboard
    resultsPage.classList.add('hidden');
    authSection.classList.remove('hidden');
    loginForm.classList.add("hidden")
    signupForm.classList.remove("hidden")
    authSectionWelcome.textContent = "Benvenuto"
    authSectionLogin.textContent = "Registrati"
}

function showFlashcards() {
    resultsPage.classList.add("hidden")
    flashcardsSection.classList.remove("hidden");
    
    caricaDatiFlashcard()
}

function showQuizzes() {
    resultsPage.classList.add("hidden")
    quizSection.classList.remove("hidden")
    caricaDatiQuiz()
}

function openAITutor() {
    resultsPage.classList.add("hidden")
    aiTutorSection.classList.remove("hidden");
    
    if (chatHistory.length === 0) {
        showSuggestedQuestions();
    }

    backToResultsFromAI.remove()
    const div = `<button id="backToResultsFromAI" onclick='backToResultsFromAIFunction("result")'
     class="px-4 py-2 hover:bg-gray-100 text-gray-700 rounded-lg transition flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
        </svg>
        <span>Indietro</span>
     </button>`
    divPadreBackToResultsFromAI.innerHTML = div
}

function handleGoogleAuth(){
    const client = google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: 'email profile',
        callback: async (response) => {
            if (response.access_token) {
                // 2. Invia il token al TUO backend
                const apiResponse = await inviaRichiesta("POST","/loginWithGoogle",{"googleToken": response.access_token })
                if(apiResponse.status == 200){
                    console.log(apiResponse.data)
                    authSection.classList.add('hidden');
                    signupForm.classList.add("hidden")
                    dashboard.classList.remove("hidden")
                    spanIniziale.textContent = apiResponse.data.nome[0].toUpperCase()
                    dataToSave["userId"] = apiResponse.data._id
                    const responseSavement = await inviaRichiesta("POST","/saveStudyData",dataToSave)
                    if(responseSavement.status == 200){
                        console.log(responseSavement.data)
                        const getPlanResponse = await inviaRichiesta("GET","/getPlan",{"id":apiResponse.data._id})
                        if(getPlanResponse.status == 200){
                            console.log(getPlanResponse.data)
                            populateDashboard(getPlanResponse.data)
                        }
                        else
                            console.log("Errore: " ,getPlanResponse.err)
                    }
                    else
                        console.log("Errore: " ,responseSavement.err)
                }
                else{
                    if(apiResponse.status == 400)
                        msgErroreRegistrazione.classList.remove("hidden")
                    else
                        console.log(apiResponse.status + " : " + apiResponse.err)
                }
            }
        },
    });
    client.requestAccessToken();
}

// ============================================
// POPOLA DASHBOARD - FUNZIONE COMPLETA
// ============================================

function populateDashboard(planData) {
    console.log('📊 Populating dashboard with:', planData);
    
    if (!planData || !planData.pianoStudio) {
        console.error('❌ Dati piano studio mancanti');
        return false;
    }
    
    const plan = planData.pianoStudio;
    
    try {
        // ============================================
        // 1. USER INFO (iniziale)
        // ============================================
        if (planData.userData?.nome) {
            const iniziale = planData.userData.nome[0].toUpperCase();
            document.getElementById('spanIniziale').textContent = iniziale;
        }
        
        // ============================================
        // 2. NEXT ACTION CARD
        // ============================================
        const nextAction = plan.timeline?.[0] || plan.nextAction;
        if (nextAction) {
            const icon = getIconByType(nextAction.type);
            document.getElementById('nextActionIcon').textContent = icon;
            document.getElementById('nextActionTitle').textContent = nextAction.title || 'Sessione di studio';
            document.getElementById('nextActionReason').textContent = nextAction.description || 'Inizia la tua sessione di studio';
            document.getElementById('nextActionDuration').textContent = nextAction.duration + ' minuti';
            document.getElementById('nextActionPriority').textContent = nextAction.priority || 'Priorità Media';
        }
        
        // ============================================
        // 3. QUICK STATS (TOP RIGHT)
        // ============================================
        const totalDuration = plan.timeline?.reduce((sum, s) => sum + (s.duration || 0), 0) || 0;
        document.getElementById('availableTime').textContent = totalDuration + ' minuti totali';
        
        const totalSessions = plan.timeline?.length || 0;
        const completedSessions = planData.sessionStats?.completedSessions || 0;
        document.getElementById('sessionsToday').textContent = completedSessions + ' / ' + totalSessions;
        
        const overallLevel = calculateOverall(plan.timeline || []);
        document.getElementById('examProgress').textContent = overallLevel + '%';
        
        // ============================================
        // 4. DIAGNOSIS - OVERALL LEVEL
        // ============================================
        document.getElementById('overallLevel').textContent = overallLevel + '%';
        
        // ============================================
        // 5. DIAGNOSIS - TOPICS ANALYSIS
        // ============================================
        populateTopicsAnalysis(plan.topics, planData.topicsStats);
        
        // ============================================
        // 6. RISK ALERT
        // ============================================
        if (plan.risk) {
            // Elemento risk è già nel DOM, potrebbe essere nascosto/mostrato
            const riskAlert = document.querySelector('[class*="Allerta Rischio"]')?.parentElement;
            if (riskAlert) {
                riskAlert.classList.toggle('hidden', plan.risk.level === 'Basso');
            }
        }
        
        // ============================================
        // 7. MATERIALS
        // ============================================
        populateMaterials(planData);
        
        // ============================================
        // 8. TIMELINE
        // ============================================
        populateTimeline(plan.timeline || []);
        
        // ============================================
        // 9. DAILY STATS (RIGHT SIDEBAR)
        // ============================================
        if (planData.sessionStats) {
        const stats = planData.sessionStats;
    
        // Time studied
        const timeRatio = (stats.timeStudied || 0) / (stats.timeGoal || 60);
        const timeSection = document.getElementById('timeStudiedSection');
        if (timeSection) {
            timeSection.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <span class="text-sm text-gray-600">Tempo studiato</span>
                <span class="text-sm font-bold text-indigo-600">${stats.timeStudied || 0} / ${stats.timeGoal || 60} min</span>
            </div>
            <div class="w-full bg-gray-100 rounded-full h-2">
                <div class="bg-linear-to-r from-indigo-600 to-purple-600 h-2 rounded-full transition-all" style="width: ${Math.min(timeRatio * 100, 100)}%"></div>
            </div>
        `;
    }
    
    // Tasks completed
    const taskRatio = (stats.tasksCompleted || 0) / (stats.tasksGoal || 5);
    const tasksSection = document.getElementById('tasksCompletedSection');
    if (tasksSection) {
        tasksSection.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <span class="text-sm text-gray-600">Task completati</span>
                <span class="text-sm font-bold text-green-600">${stats.tasksCompleted || 0} / ${stats.tasksGoal || 5}</span>
            </div>
            <div class="w-full bg-gray-100 rounded-full h-2">
                <div class="bg-green-500 h-2 rounded-full transition-all" style="width: ${Math.min(taskRatio * 100, 100)}%"></div>
            </div>
        `;
    }
    
    // Accuracy
    const accuracySection = document.getElementById('accuracySection');
    if (stats.accuracy && accuracySection) {
        accuracySection.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <span class="text-sm text-gray-600">Accuratezza quiz</span>
                <span class="text-sm font-bold text-purple-600">${stats.accuracy}%</span>
            </div>
            <div class="w-full bg-gray-100 rounded-full h-2">
                <div class="bg-purple-500 h-2 rounded-full transition-all" style="width: ${stats.accuracy}%"></div>
            </div>
        `;
    }
        }
        
        // ============================================
        // 10. STREAK
        // ============================================
        if (planData.streak !== undefined) {
            document.getElementById('streakDays').textContent = planData.streak;
        }
        
        console.log('✅ Dashboard populated successfully');
        return true;
        
    } catch (error) {
        console.error('❌ Error populating dashboard:', error);
        return false;
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getIconByType(type) {
    const icons = {
        'quiz': '❓',
        'flashcard': '📚',
        'mixed': '🎯',
        'review': '🔄',
        'exam': '🎓'
    };
    return icons[type] || '📚';
}

function calculateOverall(timeline) {
    if (!timeline?.length) return 60;
    
    const successRates = timeline
        .filter(s => s.successRate)
        .map(s => s.successRate);
    
    if (!successRates.length) return 60;
    
    const avg = successRates.reduce((a, b) => a + b, 0) / successRates.length;
    return Math.round(avg);
}

function populateTopicsAnalysis(topics, topicsStats) {
    const container = document.querySelector('[class*="Analisi per Argomento"]')?.parentElement;
    if (!container) return;
    
    // Se non ci sono stats, crea dei dati di esempio
    const exampleStats = [
        { name: topics?.[0] || 'Argomento 1', accuracy: 92, emoji: '💪', color: 'green', status: 'Eccellente - Pronto per esame' },
        { name: topics?.[1] || 'Argomento 2', accuracy: 68, emoji: '⚠️', color: 'yellow', status: 'Sufficiente - Serve ripasso' },
        { name: topics?.[2] || 'Argomento 3', accuracy: 45, emoji: '🎯', color: 'red', status: 'Critico - Focus immediato' }
    ];
    
    let html = '<h3 class="font-semibold text-gray-900 mb-3">Analisi per Argomento</h3>';
    
    exampleStats.forEach(stat => {
        const colorClass = stat.color;
        html += `
            <div class="flex items-center gap-4 p-4 bg-${colorClass}-50 rounded-xl border border-${colorClass}-200">
                <div class="w-10 h-10 bg-${colorClass}-500 rounded-lg flex items-center justify-center shrink-0">
                    <span class="text-xl">${stat.emoji}</span>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between mb-1">
                        <h4 class="font-semibold text-gray-900">${stat.name}</h4>
                        <span class="text-sm font-bold text-${colorClass}-600">${stat.accuracy}%</span>
                    </div>
                    <div class="w-full bg-${colorClass}-200 rounded-full h-1.5">
                        <div class="bg-${colorClass}-500 h-1.5 rounded-full" style="width: ${stat.accuracy}%"></div>
                    </div>
                    <p class="text-xs text-${colorClass}-700 mt-1">${stat.status}</p>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function populateMaterials(planData) {
    const container = document.getElementById('materialsList');
    if (!container) return;
    
    const plan = planData.pianoStudio;
    const flashcardCount = plan.timeline?.reduce((sum, s) => sum + (s.flashcardCount || 0), 0) || 0;
    const quizCount = plan.timeline?.reduce((sum, s) => sum + (s.quizCount || 0), 0) || 0;
    
    container.innerHTML = `
        <div class="group p-4 bg-linear-to-r from-gray-50 to-white hover:from-indigo-50 hover:to-purple-50 rounded-xl border border-gray-200 hover:border-indigo-300 transition-all cursor-pointer">
            <div class="flex items-start gap-4">
                <div class="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                    <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                    </svg>
                </div>
                <div class="flex-1">
                    <div class="flex items-start justify-between mb-2">
                        <div>
                            <h3 class="font-semibold text-gray-900 mb-1">${planData.titolo || 'Materiale caricato'}</h3>
                            <div class="flex items-center gap-2 text-xs text-gray-500">
                                <span>Ultima attività: ${planData.lastAccessed || 'oggi'}</span>
                                <span>•</span>
                                <span>${flashcardCount} flashcard</span>
                                <span>•</span>
                                <span>${quizCount} quiz</span>
                            </div>
                        </div>
                        <div class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">
                            ${planData.mastery || 45}% padronanza
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="hover:cursor-pointer px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700">
                            Studia
                        </button>
                        <button class="hover:cursor-pointer px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200">
                            Ripassa
                        </button>
                        <button class="hover:cursor-pointer px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200">
                            Quiz
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function populateTimeline(timeline) {
    const container = document.querySelector('[class*="Piano Studio"]')?.parentElement;
    if (!container || !timeline.length) return;
    
    let html = '<h2 class="text-lg font-bold text-gray-900 mb-4">📅 Piano Studio</h2><div class="space-y-3">';
    
    timeline.slice(0, 3).forEach((session, i) => {
        const borderColor = i === 0 ? 'indigo' : 'gray';
        html += `
            <div class="border-l-4 border-${borderColor}-500 pl-4 py-2">
                <p class="text-sm font-bold text-${borderColor}-600">${session.dayLabel || 'Giorno ' + (i + 1)}</p>
                <p class="font-semibold text-gray-900">${session.title}</p>
                <p class="text-sm text-gray-600">${session.duration} min • ${session.items || (session.quizCount || 0) + (session.flashcardCount || 0)} elementi</p>
            </div>
        `;
    });
    
    html += '</div>';
    
    const targetDiv = container.querySelector('.space-y-3');
    if (targetDiv) {
        targetDiv.innerHTML = html;
    }
}
