"use strict"

let flashcardGlobal = []
var currentIndex = 0;
var isFlipped = false;
var viewMode = "single";

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
  statusEl.offsetHeight; // force reflow
  statusEl.style.animation = 'status-change .35s ease both';
  statusEl.textContent = msg;
}

function updateBar(pct) {
  const pctEl  = document.getElementById('pct');
  const barFill = document.querySelector('.bar-fill');

  if (pctEl)   pctEl.textContent = pct + '%';
  if (barFill) {
    barFill.style.animation  = 'bar-sheen 1.8s linear infinite'; // mantieni solo lo sheen
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
      // completato
      el.className = `step-done ${STEP_BASE}`;
      ic.className = `icon-done ${ICON_BASE}`;
      ic.textContent = '✓';
    } else if (i === stepNumber) {
      // attivo
      el.className = `step-active ${STEP_BASE}`;
      ic.className = `icon-active icon-active-pulse ${ICON_BASE}`;
      ic.textContent = '●';
    } else {
      // in attesa
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
  // Validazione tipo
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
  if (!allowedTypes.includes(file.type)) {
    alert('❌ Tipo file non supportato. Usa PDF, JPG o PNG');
    return;
  }
  // Validazione dimensione
  if (file.size > 10 * 1024 * 1024) {
    alert('❌ File troppo grande. Massimo 10MB');
    return;
  }

  documentTitle.textContent = file.name;

  // Stato iniziale UI
  updateBar(0);
  activateStep(1);
  setStatus('Avvio elaborazione...');

  const formData = new FormData();
  formData.append('file', file);

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

  // Leggi lo stream SSE
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Accumula nel buffer — i chunk possono arrivare spezzati
    buffer += decoder.decode(value, { stream: true });

    // Processa solo le righe complete (separate da \n)
    const lines = buffer.split("\n");
    buffer = lines.pop(); // l'ultima potrebbe essere incompleta

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;

      let data;
      try {
        data = JSON.parse(line.slice(6));
      } catch {
        continue; // riga malformata, salta
      }

      // Errore dal server
      if (data.error) {
        alert("❌ " + data.error);
        return;
      }

      // Aggiorna UI con dati reali
      if (data.pct  !== undefined) updateBar(data.pct);
      if (data.msg  !== undefined) setStatus(data.msg);
      if (data.step !== undefined) activateStep(data.step);

      // Elaborazione completata
      if (data.done) {
        try {
          const flashcards = JSON.parse(data.flashcard);
          console.log(flashcards)
          flashcardGlobal = flashcards
          const quiz = JSON.parse(data.quiz);

          showDone();
          updateBar(100);
          activateStep(5); // marca tutti gli step come ✓

          divElaborazioneCompletata.classList.remove("hidden");
          divElaborazioneCompletata.classList.add("inline-flex");
          divCreazione.classList.remove("hidden");
          divFlashcard.classList.remove("hidden");
          divQuiz.classList.remove("hidden");
          divTutorAi.classList.remove("hidden");
          buttons.classList.remove("hidden");
          buttons.classList.add("flex");
          flashcardCount.textContent = flashcards.length;
          quizCount.textContent = quiz.length;
          loadingSection.classList.add("hidden")
          nomeDocumento.classList.remove("hidden")
          results.classList.remove("py-10")
          results.classList.add("py-16")
          window.flashcardsData = flashcards
          window.quizData = quiz
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

// ============================================
// EVENT LISTENERS
// ============================================

scaricaQuizFlashcards.addEventListener("click", scaricaTutto);

showFlashcard.addEventListener("click", function() {
    // Nascondi results, mostra flashcard section
    sezioneResults.classList.add("hidden");
    flashcardsSection.classList.remove("hidden");
    
    // Popola dati globali se non già fatto
    if (flashcardGlobal.length === 0 && generatedData?.flashcards) {
        flashcardGlobal = generatedData.flashcards;
    }
    
    // Reset index
    currentIndex = 0;
    isFlipped = false;
    
    // Update header
    flashcardCountFlashcardSection.textContent = flashcardGlobal.length + " Flashcard Generate";
    totalNum.textContent = flashcardGlobal.length;
    currentNum.textContent = "1";
    
    // Render prima card
    renderCard();
});

btnStudio.addEventListener("click", function() {
    singleView.classList.remove("hidden");
    gridView.classList.add("hidden");
    
    // Update button styles
    btnStudio.classList.add("bg-indigo-600", "text-white");
    btnStudio.classList.remove("bg-white", "border-2", "border-gray-300", "text-gray-700");
    
    btnGrid.classList.remove("bg-indigo-600", "text-white");
    btnGrid.classList.add("bg-white", "border-2", "border-gray-300", "text-gray-700");
});

btnGrid.addEventListener("click", function() {
    singleView.classList.add("hidden");
    gridView.classList.remove("hidden");
    gridView.classList.add("grid")
    
    // Update button styles
    btnGrid.classList.add("bg-indigo-600", "text-white");
    btnGrid.classList.remove("bg-white", "border-2", "border-gray-300", "text-gray-700");
    
    btnStudio.classList.remove("bg-indigo-600", "text-white");
    btnStudio.classList.add("bg-white", "border-2", "border-gray-300", "text-gray-700");
    
    // Render grid view
    renderGridView();
});

// ============================================
// RENDER CARD (crea HTML)
// ============================================

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
        
        <!-- Front -->
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

        <!-- Back -->
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
    
    // Aggiungi event listener
    const cardContainer = document.getElementById('flashcardContainer');
    if (cardContainer) {
        cardContainer.addEventListener('click', flipCard);
    }
}

// ============================================
// FLIP CARD (gira la carta)
// ============================================

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

// ============================================
// NEXT FLASHCARD (carta successiva)
// ============================================

nextFlashcard.addEventListener("click", function() {
    // Reset flip state
    isFlipped = false;
    
    // Incrementa index (con loop)
    currentIndex = (currentIndex + 1) % flashcardGlobal.length;
    
    // Re-render card
    renderCard();
    
    // Update UI
    currentNum.textContent = currentIndex + 1;
});

// ============================================
// PREVIOUS FLASHCARD (carta precedente)
// ============================================

prevFlashcard.addEventListener("click", function() {
    // Reset flip state
    isFlipped = false;
    
    // Decrementa index (con loop)
    currentIndex = (currentIndex - 1 + flashcardGlobal.length) % flashcardGlobal.length;
    
    // Re-render card
    renderCard();
    
    // Update UI
    currentNum.textContent = currentIndex + 1;
});

// ============================================
// PROGRESS DOTS CON FINESTRA SCORREVOLE
// ============================================

function createDot(index, isActive) {
    const dot = document.createElement('div');
    
    if (isActive) {
        dot.className = "h-2 w-6 rounded-full bg-indigo-600 transition-all flex-shrink-0";
    } else {
        dot.className = "h-2 w-2 rounded-full bg-gray-300 hover:bg-gray-400 transition-all cursor-pointer flex-shrink-0";
        dot.addEventListener('click', () => {
            isFlipped = false;
            currentIndex = index;
            renderCard();
            currentNum.textContent = currentIndex + 1;
        });
    }
}

// ============================================
// RENDER VISTA GRIGLIA
// ============================================

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
            <!-- Header -->
            <div class="bg-linear-to-r from-indigo-500 to-purple-600 px-4 py-3 flex items-center justify-between w-full">
                <span class="text-white font-bold text-sm">Card ${index + 1}</span>
                <svg class="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
            </div>
            
            <!-- Question Preview -->
            <div class="p-4 w-full">
                <div class="flex items-start gap-2 mb-3 w-full">
                    <svg class="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <p class="text-sm font-medium text-gray-800 line-clamp-3 flex-1 min-w-0">${card.front}</p>
                </div>
                
                <!-- Answer Preview -->
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

// ============================================
// MODAL CARD
// ============================================

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
            <!-- Header -->
            <div class="bg-linear-to-r from-indigo-500 to-purple-600 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                <h3 class="text-white font-bold text-lg">Flashcard ${index + 1} / ${flashcardGlobal.length}</h3>
                <button onclick="closeCardModal()" class="hover:cursor-pointer text-white hover:bg-white/20 rounded-lg p-2 transition">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
            
            <!-- Content -->
            <div class="p-6">
                <!-- Question -->
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
                
                <!-- Divider -->
                <div class="border-t border-gray-200 my-6"></div>
                
                <!-- Answer -->
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
            
            <!-- Footer -->
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
        </div>
    `;
    
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

if (tryAgainBtn) {
  tryAgainBtn.addEventListener('click', () => {
    resultsState.classList.add('hidden');
    uploadArea.classList.remove('hidden');
    fileInput.value = '';
    filePreview.classList.add('hidden');
  });
}

if (viewResultsBtn) {
  viewResultsBtn.addEventListener('click', () => {
    window.location.href = 'upload.html';
  });
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k     = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i     = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

//Download pdf con quiz e flashcard
function scaricaTutto() {
    console.log('📄 Generando PDF...');
    
    // ✅ PARSE se sono stringhe
    let flashcards = window.flashcardsData;
    let quiz = window.quizData;
    
    // Se sono stringhe, parse
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
    
    // ... resto codice PDF ...
    
    let yPosition = 20;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 20;
    const lineHeight = 7;
    
    // ============================================
    // TITOLO
    // ============================================
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('SmartLearn - Materiale di Studio', margin, yPosition);
    yPosition += 15;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generato da: ${documentTitle.textContent}`, margin, yPosition);
    yPosition += 10;
    
    // Linea separatore
    doc.line(margin, yPosition, 190, yPosition);
    yPosition += 10;
    
    // ============================================
    // SEZIONE FLASHCARD
    // ============================================
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Flashcard', margin, yPosition);
    yPosition += 10;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    if (flashcards && flashcards.length > 0) {
        flashcards.forEach((card, index) => {
            // Controlla se serve nuova pagina
            if (yPosition > pageHeight - 40) {
                doc.addPage();
                yPosition = 20;
            }
            
            // Numero flashcard
            doc.setFont('helvetica', 'bold');
            doc.text(`${index + 1}.`, margin, yPosition);
            
            // Domanda (front)
            doc.setFont('helvetica', 'bold');
            const frontLines = doc.splitTextToSize(`Q: ${card.front}`, 160);
            doc.text(frontLines, margin + 10, yPosition);
            yPosition += frontLines.length * lineHeight;
            
            // Risposta (back)
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
    
    // ============================================
    // SEZIONE QUIZ
    // ============================================
    
    // Nuova pagina per quiz
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
            // Controlla se serve nuova pagina
            if (yPosition > pageHeight - 60) {
                doc.addPage();
                yPosition = 20;
            }
            
            // Domanda
            doc.setFont('helvetica', 'bold');
            const questionLines = doc.splitTextToSize(`${index + 1}. ${q.question}`, 160);
            doc.text(questionLines, margin, yPosition);
            yPosition += questionLines.length * lineHeight + 3;
            
            // Opzioni
            doc.setFont('helvetica', 'normal');
            q.options.forEach((option, optIndex) => {
                const isCorrect = optIndex === q.correct;
                const prefix = String.fromCharCode(65 + optIndex); // A, B, C, D
                
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
    
    // ============================================
    // SALVA PDF
    // ============================================
    
    const filename = `SmartLearn_${documentTitle.textContent.replace('.pdf', '')}_${Date.now()}.pdf`;
    doc.save(filename);
    
    console.log('✅ PDF generato:', filename);
}
