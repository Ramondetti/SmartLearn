"use strict"

let documentoCorrente
let testoEstratto
let flashcardGlobal = []
let quizGlobal = []
let currentIndex = 0;
let isFlipped = false;
let viewMode = "single";
let dataToSave
let quizPlanFlashcard
let currentPlan
let currentMap
let cy //mappa
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

btnNuovoPiano.addEventListener("mouseover", function() {
    this.style.backgroundColor = "#15803d"; // Verde più scuro
});

btnNuovoPiano.addEventListener("mouseout", function() {
    this.style.backgroundColor = "#16a34a"; // Verde originale
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
    divPadreBackToResultsFromAI.innerHTML = `
    <button id="backToResultsFromAI" onclick="backToResultsFromAIFunction('sezioneResultsPreview')"
        class="px-4 py-2 hover:bg-gray-100 text-gray-700 rounded-lg transition flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
        </svg>
        <span>Indietro</span>
    </button>
    `
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

showSectionStartNav.addEventListener("click",function(){
    homepage.classList.add("hidden")
    authSection.classList.remove("hidden")
    containerBtnLoginGoogle.innerHTML = `
    <button id="btnGoogle" onclick="loginWithGoogle()" class="hover:cursor-pointer w-full flex items-center justify-center gap-2.5 px-4 py-2.5 border-2 border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all group">
        <svg class="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        <span class="text-sm font-medium text-gray-700 group-hover:text-gray-900">Continua con Google</span>
    </button>
    `
})

function loginWithGoogle(){
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
                    pianiSection.classList.remove("hidden")
                    getAndAddPlans(apiResponse.data._id)
                }
                else{
                    if(apiResponse.status == 400)
                        msgErroreLogin.classList.remove("hidden")
                    else
                        console.log(apiResponse.status + " : " + apiResponse.err)
                }
            }
        },
    });
    client.requestAccessToken();
}

async function getAndAddPlans(userId) {
    const response = await inviaRichiesta("GET", "/getPlans", { userId });
    
    if (response.status === 200) {
        console.log(response.data);
        listaPiani.innerHTML = ""; // Svuota il contenitore prima di ripopolare
        const piani = response.data;

        piani.forEach(function(json, i) {
            const card = document.createElement("div");
            // Applichiamo classi diverse se è active o archiviato
            card.className = `p-4 rounded-xl border ${json.plan.status === 'active' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white'}`;
            
            // Definiamo il bottone solo se attivo
            const isAttivo = json.plan.status === 'active';
            const bottoneHtml = isAttivo 
                ? `<button id="btnVisualizzaPiano-${i}" class="hover:cursor-pointer px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition">
                       Continua Piano
                   </button>` 
                : "";

            card.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <h3 class="font-bold text-lg">${json.plan.titolo}</h3>
                        <p class="text-sm text-gray-600">Status: ${json.plan.status}</p>
                    </div>
                    <div class="flex flex-col gap-2 items-end">
                        <span class="px-3 py-1 ${isAttivo ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'} text-xs rounded-full">
                            ${isAttivo ? 'In corso' : 'Archiviato'}
                        </span>
                        ${bottoneHtml}
                    </div>
                </div>
            `;
            
            listaPiani.appendChild(card);

            // Aggiungiamo il listener solo se il bottone è stato effettivamente creato
            if (isAttivo) {
                document.querySelector("#btnVisualizzaPiano-" + i).addEventListener("click", function() {
                    pianiSection.classList.add("hidden");
                    dashboard.classList.remove("hidden");
                    
                    currentPlan = json.plan;
                    dataToSave = { userId: json.plan.userId };
                    
                    popolaDashboard(json);
                });
            }
        });
    } else {
        console.error("Errore nel recupero piani: " + response.status + " : " + response.err);
    }
}

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
    if(sezione == "sezioneResults"){
        resultsPage.classList.remove("hidden");
        return
    }
    if(sezione == "dashboard"){
        dashboard.classList.remove("hidden")
        return
    }
    if(sezione == "studySection"){
        studySection.classList.remove("hidden")
        return
    }
    sezioneResults.classList.remove("hidden")
}

async function handleLogin(event){
    event.preventDefault()
    console.log(checkboxRicordami.checked)
    const httResponse = await inviaRichiesta("POST","/login",{"username":loginEmail.value,"password":loginPassword.value,"ricordami":checkboxRicordami.checked})
        if(httResponse.status == 200){
            console.log(httResponse.data)
            authSection.classList.add("hidden")
            pianiSection.classList.remove("hidden")
            getAndAddPlans(httResponse.data._id)
        }
        else{
            if(httResponse.status == 401)
                msgErroreLogin.classList.remove("hidden")
            else
                console.error(httResponse.status + " : " + httResponse.err)
        }
}

btnNuovaPassword.addEventListener("click",function(){
    authSection.classList.add("hidden")
    resetPasswordSection.classList.remove("hidden")
})

btnAnnullaReset.addEventListener("click",function(){
    authSection.classList.remove("hidden")
    resetPasswordSection.classList.add("hidden")
})

btnInviaReset.addEventListener("click",async function(){
    const response = await inviaRichiesta("POST","/passwordDimenticata",{"email":emailReset.value})
    if(response.status == 200){
        console.log(response.data)
        resetPasswordSection.classList.add("hidden")
        authSection.classList.remove("hidden")
    }
    else
        console.error(response.status + " : " + response.err)
})

btnNuovoPiano.addEventListener("click",function(){
    pianiSection.classList.add("hidden")
    onboardingSection.classList.remove("hidden")
    step0.classList.remove("hidden")
    processingUpdates.innerHTML = ""
})

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
                const getPlanResponse = await inviaRichiesta("GET","/getPlanQuizFlashcard",{"id":httResponse.data._id, title:responseSavement.data.titoloMateriale,
                    materialId:responseSavement.data.materialId
                })
                if(getPlanResponse.status == 200){
                    console.log(getPlanResponse.data)
                    quizGlobal = getPlanResponse.data.quizzes
                    flashcardGlobal = getPlanResponse.data.flashcards
                    popolaDashboard(getPlanResponse.data)
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
    charCountCore.textContent = count;
    
    if (count > 2000) {
        charCountCore.classList.add('text-red-500');
    } else {
        charCountCore.classList.remove('text-red-500');
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

function caricaDatiQuiz(quizData = quizGlobal) {
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

    totalEl.textContent = "/ " + quizData.length;

    function renderQuestion() {

        const q = quizData[currentQuestion];

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
    fileInput.click();
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
        dropZoneCoreSection.addEventListener(eventName, (e) => {
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
                        console.log(data)
                        testoEstratto = data.extractedText
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
    sessions.textContent = data.stats.sessions;
    completion.textContent = data.stats.completion;

    // NEXT ACTION
    nextActionTitleResultsPage.textContent = data.nextAction.title;
    nextActionDescriptionResultsPage.textContent = data.nextAction.description;

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

async function startStudying() {
    // Nascondi results, mostra dashboard
    resultsPage.classList.add('hidden');
    const response = await inviaRichiesta("GET","/checkToken")
    if(response.status == 200){
        const token = response.data.token
        console.log(token)
        const userData = parseJwt(token)
        console.log(userData)
        showDashboardAndPopolIt(userData)
        return
    }
    if(response.status == 403){
        authSection.classList.remove('hidden');
        loginForm.classList.add("hidden")
        signupForm.classList.remove("hidden")
        authSectionWelcome.textContent = "Benvenuto"
        authSectionLogin.textContent = "Registrati"
        return
    }
    console.log(response.status + " : " + response.err)
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    console.log(value)
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

function parseJwt(token) {
    try {
        // Il payload è la seconda parte del token
        const base64Url = token.split('.')[1];
        // Decodifica Base64
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Token non valido", e);
        return null;
    }
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
    const div = `<button id="backToResultsFromAI" onclick='backToResultsFromAIFunction("sezioneResults")'
     class="px-4 py-2 hover:bg-gray-100 text-gray-700 rounded-lg transition flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
        </svg>
        <span>Indietro</span>
     </button>`
    divPadreBackToResultsFromAI.innerHTML = div
}

function initCytoscape(conceptMap) {
  // Trasforma il JSON del server nel formato "elements" di Cytoscape
  const elements = [
    ...conceptMap.nodes.map(n => ({
      data: { id: n.id, label: n.label, summary: n.summary }
    })),
    ...conceptMap.links.map(l => ({
      data: { source: l.source, target: l.target, label: l.relation }
    }))
  ];

  cy = cytoscape({
    container: document.getElementById('cy'), // Il tuo div sezione
    elements: elements,
    style: [
  {
    selector: 'node',
    style: {
      'shape': 'round-rectangle',      // Forma rettangolare con angoli arrotondati
      'background-color': '#ffffff',   // Sfondo bianco
      'border-width': 2,
      'border-color': '#4f46e5',       // Bordo colorato
      'label': 'data(label)',
      'color': '#000000',              // TESTO NERO
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': '14px',
      'font-weight': 'bold',
      'padding': '15px',               // Spazio interno per far respirare il testo
      'width': 'label',                // LA MAGIA: la larghezza si adatta al testo
      'height': 'label',               // LA MAGIA: l'altezza si adatta al testo
      'text-wrap': 'wrap',             // Va a capo se il testo è troppo lungo
      'text-max-width': '120px'        // Limita la larghezza massima per evitare nodi giganti
    }
  },
  {
    selector: 'edge',
    style: {
      'width': 2,
      'line-color': '#94a3b8',
      'target-arrow-color': '#94a3b8',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'label': 'data(label)',          // Mostra la relazione sulla linea
      'text-background-color': '#ffffff',
      'text-background-opacity': 1,
      'color': '#000000'               // Testo relazione nero
    }
  }
],
    layout: {
      name: 'cose', // Layout dinamico ottimo per le mappe concettuali
      animate: true
    }
  });

  // Aggiungi interattività: click sul nodo
  cy.on('tap', 'node', function(evt) {
    const node = evt.target;
    console.log("Dettaglio: " + node.data('summary'));
  });
}

function showConceptMap(){
    resultsPage.classList.add("hidden")
    mapSection.classList.remove("hidden")
    initCytoscape(dataToSave.map)
}

function closeMap(from){
    if(from == "dashboard")
        dashboard.classList.remove("hidden")
    else
        resultsPage.classList.remove("hidden")
    mapSection.classList.add("hidden")
}

function showMapFromDashboard(){
    dashboard.classList.add("hidden")
    mapSection.classList.remove("hidden")
    divPadreMapSectionBtn.innerHTML = `
    <h2 class="text-xl font-bold text-gray-800">Mappa Concettuale</h2>
    <button onclick="closeMap('dashboard')" class="text-gray-400 hover:cursor-pointer hover:text-gray-600 transition-colors">
        ✕ Chiudi
    </button>
    `
    initCytoscape(dataToSave.map)
}

function handleGoogleAuth(){
    const client = google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: 'email profile',
        callback: async (response) => {
            if (response.access_token) {
                // 2. Invia il token al TUO backend
                const apiResponse = await inviaRichiesta("POST","/signUpWithGoogle",{"googleToken": response.access_token })
                if(apiResponse.status == 200){
                    console.log(apiResponse.data)
                    authSection.classList.add('hidden');
                    signupForm.classList.add("hidden")
                    showDashboardAndPopolIt(apiResponse.data)
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

async function showDashboardAndPopolIt(data){
    dashboard.classList.remove("hidden")
    spanIniziale.textContent = data.nome[0].toUpperCase()
    dataToSave["userId"] = data._id
    const responseSavement = await inviaRichiesta("POST","/saveStudyData",dataToSave)
    if(responseSavement.status == 200){
        console.log(responseSavement.data)
        const getPlanResponse = await inviaRichiesta("GET","/getPlanQuizFlashcard",{"id":data._id,"title":responseSavement.data.titoloMateriale,
             "materialId":responseSavement.data.materialId})
        if(getPlanResponse.status == 200){
            console.log(getPlanResponse.data)
            quizGlobal = getPlanResponse.data.quizzes
            flashcardGlobal = getPlanResponse.data.flashcards
            popolaDashboard(getPlanResponse.data)
            currentPlan = getPlanResponse.data.plan
        }
        else
            console.log("Errore: " ,getPlanResponse.err)
    }
    else
        console.log("Errore: " ,responseSavement.err)
}

function popolaDashboard(data) {
  console.log(data)
  quizPlanFlashcard = data
  quizGlobal = data.quizzes
  flashcardGlobal = data.flashcards
  const plan = data.plan
  nextActionTitle.textContent = plan.pianoStudio.nextAction.title
  nextActionDescription.textContent = plan.pianoStudio.nextAction.description
  nextActionDuration.textContent = plan.pianoStudio.nextAction.duration
  availableTime.textContent = plan.pianoStudio.estimatedTime
  examProgress.textContent = (plan.pianoStudio.mastery.toFixed(2)) + "%"
  completamento.textContent = (plan.pianoStudio.mastery.toFixed(2)) + "%"
  quizCountDashboard.textContent = data.quizzes.length + " quiz"
  flashcardCountDashboard.textContent = data.flashcards.length + " flashcard"

  const topics = plan.pianoStudio.topics;
  const container = document.getElementById('topicsContainer');
  container.innerHTML = topics.map((topic, i) => `
    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div class="flex items-center gap-3">
        <span class="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs flex items-center justify-center font-bold shrink-0">${i + 1}</span>
        <span class="text-sm font-medium text-gray-700">${topic}</span>
      </div>
    </div>
  `).join('');
}

startQuiz.addEventListener("click",function(){
    dashboard.classList.add("hidden")
    quizSection.classList.remove("hidden")
    caricaDatiQuiz()
    aggiungiBtnQuiz()
})

function aggiungiBtnQuiz(textContent = "Torna indietro"){
    goToAIFromQuiz.remove()
    if(document.getElementById("backToFlashcards"))
        backToFlashcards.remove()
    const btnBack = document.createElement("button")
    btnBack.textContent = textContent
    
    btnBack.addEventListener("click",async function(){
        dashboard.classList.remove("hidden")
        quizSection.classList.add("hidden")
        if(textContent == "Continua"){
            const response = await inviaRichiesta("PATCH","/cambiaNextAction",{"title":currentPlan.titolo,
            "userId":currentPlan.userId
            })
            if(response.status == 200){
                console.log(response.data)
                if(!response.data.isLastAction){
                    const getPlanResponse = await inviaRichiesta("GET","/getPlanQuizFlashcard",{"id":dataToSave["userId"], "title":response.data.titoloDocumento,
                        "materialId":response.data.materialId
                    })
                    if(getPlanResponse.status == 200){
                        console.log(getPlanResponse.data)
                        quizGlobal = getPlanResponse.data.quizzes
                        flashcardGlobal = getPlanResponse.data.flashcards
                        popolaDashboard(getPlanResponse.data)
                        currentPlan = getPlanResponse.data.plan
                        }
                    else
                        console.log("Errore: " ,getPlanResponse.err)
                }
                else{
                    dashboard.classList.add("hidden")
                    congratulationsSection.classList.remove("hidden")
                }
            }
            else
                console.log(response.status + " : " + response.err)
        }
    })
    const classiDaAggiungere = [
        "hover:cursor-pointer",
        "rounded-xl",
        "bg-purple-600",
        "px-6",
        "py-3",
        "text-white",
        "font-medium",
        "hover:bg-purple-700",
        "transition"
    ];

    btnBack.classList.add(...classiDaAggiungere);
    quizSectionBtns.appendChild(btnBack)
}

startFlashcard.addEventListener("click",function(){
    dashboard.classList.add("hidden")
    flashcardsSection.classList.remove("hidden")
    caricaDatiFlashcard()
    aggiungiBtnFlashcard()
})

function aggiungiBtnFlashcard(textContent = "Torna indietro"){
    goToQuiz?.remove()
    goToAI.remove()

    console.log(textContent)

    const btnBackFlashcard = document.createElement("button")
    btnBackFlashcard.textContent = textContent
    btnBackFlashcard.addEventListener("click",async function(){
        dashboard.classList.remove("hidden")
        flashcardsSection.classList.add("hidden")
        if(textContent == "Continua"){
            const response = await inviaRichiesta("PATCH","/cambiaNextAction",{"title":currentPlan.titolo,
            "userId":currentPlan.userId
            })
            if(response.status == 200){
                const getPlanResponse = await inviaRichiesta("GET","/getPlanQuizFlashcard",{"id":dataToSave["userId"],"title":response.data.titoloDocumento,
                    "materialId":response.data.materialId
                })
            if(getPlanResponse.status == 200){
                console.log(getPlanResponse.data)
                quizGlobal = getPlanResponse.data.quizzes
                flashcardGlobal = getPlanResponse.data.flashcards
                popolaDashboard(getPlanResponse.data)
                currentPlan = getPlanResponse.data.plan
            }
            else
                console.log("Errore: " ,getPlanResponse.err)
            }
            else
                console.log(response.status + " : " + response.err)
        }

    })
    const classiDaAggiungere = [
        "hover:cursor-pointer",
        "rounded-xl",
        "bg-purple-600",
        "px-6",
        "py-3",
        "text-white",
        "font-medium",
        "hover:bg-purple-700",
        "transition"
    ];

    btnBackFlashcard.classList.add(...classiDaAggiungere);
    fatherDivFlashcardBtns.appendChild(btnBackFlashcard)
}

btnNavigateToChat.addEventListener("click",function(){
    dashboard.classList.add("hidden")
    aiTutorSection.classList.remove("hidden")

    backToResultsFromAI.remove()
    divPadreBackToResultsFromAI.innerHTML = `
            <button id="backToResultsFromAI" onclick="backToResultsFromAIFunction('dashboard')"
                class="px-4 py-2 hover:bg-gray-100 text-gray-700 rounded-lg transition flex items-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                    </svg>
                    <span>Indietro</span>
                </button>`
})

function startNextAction(){
    dashboard.classList.add("hidden")
    const action = quizPlanFlashcard.plan.pianoStudio.nextAction;
    
    switch(action.type) {
        case 'quiz':
            quizSection.classList.remove("hidden")
            caricaDatiQuiz(quizPlanFlashcard.plan.pianoStudio.nextAction.quizList)
            aggiungiBtnQuiz("Continua")
            break;
        case 'studio':
            renderStudyView(action);
            break;
        case 'flashcard':
            flashcardsSection.classList.remove("hidden")
            caricaDatiFlashcard()
            aggiungiBtnFlashcard("Continua")
            break
        case 'exam':
            quizSection.classList.remove("hidden")
            caricaDatiQuiz()
            aggiungiBtnQuiz("Continua")
            break
        default:
            return
    }
}

function renderStudyView(action) {
    const section = document.getElementById('studySection');
    const titleEl = document.getElementById('studyTitle');
    const contentEl = document.getElementById('studyContent');

    // 1. Popolamento dinamico
    titleEl.textContent = action.title;
    
    // Inseriamo la descrizione e i metadati, seguiti dal TESTO INTEGRALE estratto dall'AI
    contentEl.innerHTML = `
        <p class="text-gray-600 mb-6 italic">${action.description}</p>

        <div class="pdf-content-container">
            ${action.content}
        </div>
    `;

    // 2. Mostra la sezione
    section.classList.remove("hidden");
    
    // 3. Scroll automatico all'inizio del contenuto
    section.scrollIntoView({ behavior: 'smooth' });
}

function backToDashboard(){
    dashboard.classList.remove("hidden")
    studySection.classList.add("hidden")
}

function goToChatbot(){
    studySection.classList.add("hidden")
    aiTutorSection.classList.remove("hidden")

    if (chatHistory.length === 0) {
        showSuggestedQuestions();
    }

    backToResultsFromAI.remove()
    const div = `<button id="backToResultsFromAI" onclick='backToResultsFromAIFunction("studySection")'
     class="px-4 py-2 hover:bg-gray-100 text-gray-700 rounded-lg transition flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
        </svg>
        <span>Indietro</span>
     </button>`
    divPadreBackToResultsFromAI.innerHTML = div
}

async function markStudyAsComplete(){
    studySection.classList.add("hidden")
    dashboard.classList.remove("hidden")

    const response = await inviaRichiesta("PATCH","/cambiaNextAction",{"title":currentPlan.titolo,
        "userId":currentPlan.userId
    })
    if(response.status == 200){
        console.log(response.data)
        if(!response.data.isLastAction){
            const getPlanResponse = await inviaRichiesta("GET","/getPlanQuizFlashcard",{"id":dataToSave["userId"], "title":response.data.titoloDocumento,
                "materialId":response.data.materialId
            })
            if(getPlanResponse.status == 200){
                console.log(getPlanResponse.data)
                quizGlobal = getPlanResponse.data.quizzes
                flashcardGlobal = getPlanResponse.data.flashcards
                popolaDashboard(getPlanResponse.data)
                currentPlan = getPlanResponse.data.plan
            }
            else
                console.log("Errore: " ,getPlanResponse.err)
        }
        else{
            dashboard.classList.add("hidden")
            congratulationsSection.classList.remove("hidden")
        }
    }
    else
        console.log(response.status + " : " + response.err)
}

function showUploadForm(){
    congratulationsSection.classList.add("hidden")
    onboardingSection.classList.remove("hidden")
    step0.classList.remove("hidden")
    processingUpdates.innerHTML = ""
}