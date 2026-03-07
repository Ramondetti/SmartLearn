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
            target.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
            // Close mobile menu if open
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

    // Observe all sections
    document.querySelectorAll('section').forEach(section => {
      observer.observe(section);
    });

  // ============================================
  // HERO DEMO INTERACTION
  // ============================================

  // ============================================
  // FILE SELECTION
  // ============================================

  // Click su button "Seleziona File"
  selectFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  // Click su drop zone
  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  // File selezionato tramite input
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFile(file);
      homepage.classList.add("hidden")
      sezioneResults.classList.remove("hidden")
    }
  });

  //NON FUNZIONA
  // ============================================
  // DRAG & DROP
  // ============================================

// click per aprire file picker
dropZone.addEventListener("click", () => {
    fileInput.click();
});

// quando trascini sopra
dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();

    dropZone.classList.add(
        "border-blue-500",
        "bg-blue-50",
        "scale-105"
    );
});

// quando esci
dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove(
        "border-blue-500",
        "bg-blue-50",
        "scale-105"
    );
});

// quando rilasci
dropZone.addEventListener("drop", (e) => {
    e.preventDefault();

    dropZone.classList.remove(
        "border-blue-500",
        "bg-blue-50",
        "scale-105"
    );

    const file = e.dataTransfer.files[0]
    if (file) {
      handleFile(file)
      homepage.classList.add("hidden")
      sezioneResults.classList.remove("hidden")
    }
    
});

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // ============================================
  // FILE HANDLING
  // ============================================

  async function handleFile(file) {
    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      alert('❌ Tipo file non supportato. Usa PDF, JPG o PNG');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('❌ File troppo grande. Massimo 10MB');
      return;
    }

    documentTitle.textContent = file.name;

    const formData = new FormData();
    formData.append('file', file);
    const httpResponse = await inviaRichiesta("POST", "/upload", formData);

    if(httpResponse.status == 200){
      console.log(httpResponse.data)
      const flashcards = JSON.parse(httpResponse.data.flashcard)
      const quiz = JSON.parse(httpResponse.data.quiz)
      console.log(flashcards)
      divElaborazioneCompletata.classList.remove("hidden")
      divElaborazioneCompletata.classList.add("inline-flex")
      divCreazione.classList.remove("hidden")
      divFlashcard.classList.remove("hidden")
      divQuiz.classList.remove("hidden")
      divTutorAi.classList.remove("hidden")
      buttons.classList.remove("hidden")
      buttons.classList.add("flex")
      flashcardCount.textContent = flashcards.length
      quizCount.textContent = quiz.length
    }
    else
      alert(httpResponse.status + " : " + httpResponse.err)
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  // ============================================
  // BUTTONS
  // ============================================

  // Pulsante "Nuovo Upload"
  if (tryAgainBtn) {
    tryAgainBtn.addEventListener('click', () => {
      resultsState.classList.add('hidden');
      uploadArea.classList.remove('hidden');
      fileInput.value = '';
      filePreview.classList.add('hidden');
    });
  }

  // Pulsante "Visualizza Tutto"
  if (viewResultsBtn) {
    viewResultsBtn.addEventListener('click', () => {
      // In produzione: vai alla pagina risultati
      window.location.href = 'upload.html';
      
      // Per ora: mostra alert
      // alert('In produzione: qui andresti alla pagina dei risultati!');
    });
  }