"use strict"

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

scaricaQuizFlashcards.addEventListener("click",scaricaTutto)

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
