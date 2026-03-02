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

  let selectedFile = null;

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

  // ============================================
  // DRAG & DROP
  // ============================================

  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Highlight drop zone when dragging over it
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.add('border-indigo-500', 'bg-indigo-50');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove('border-indigo-500', 'bg-indigo-50');
    });
  });

  // Handle dropped files
  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  });

  // ============================================
  // FILE HANDLING
  // ============================================

  function handleFile(file) {
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

    selectedFile = file;
    documentTitle.textContent = file.name;

    // Auto-start demo dopo 500ms
    setTimeout(() => {
      startDemo();
    }, 500);
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  // ============================================
  // DEMO ANIMATION
  // ============================================

  const progressSteps = [
    { progress: 20, text: 'Caricamento file...' },
    { progress: 40, text: 'Estrazione testo (OCR)...' },
    { progress: 60, text: 'Analisi contenuto AI...' },
    { progress: 80, text: 'Generazione flashcard...' },
    { progress: 95, text: 'Creazione quiz...' },
    { progress: 100, text: 'Completato!' }
  ];

  let currentStep = 0;

  function startDemo() {
    // Nascondi upload area
    uploadArea.classList.add('hidden');
    
    // Mostra processing
    processingState.classList.remove('hidden');
    
    // Resetta progresso
    currentStep = 0;
    progressBar.style.width = '0%';
    
    // Anima progresso
    animateProgress();
  }

  function animateProgress() {
    if (currentStep < progressSteps.length) {
      const step = progressSteps[currentStep];
      
      // Aggiorna UI
      progressBar.style.width = step.progress + '%';
      progressText.textContent = step.text;
      
      currentStep++;
      
      // Prossimo step
      setTimeout(animateProgress, 600);
    } else {
      // Fine processing, mostra risultati
      setTimeout(showResults, 300);
    }
  }

  function showResults() {
    // Nascondi processing
    processingState.classList.add('hidden');
    
    // Mostra risultati con animazione
    resultsState.classList.remove('hidden');
    
    // Anima le card una alla volta
    const cards = resultsState.querySelectorAll('.group');
    cards.forEach((card, index) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      
      setTimeout(() => {
        card.style.transition = 'all 0.5s ease-out';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, index * 150);
    });
  }

  // ============================================
  // BUTTONS
  // ============================================

  // Pulsante "Nuovo Upload"
  if (tryAgainBtn) {
    tryAgainBtn.addEventListener('click', () => {
      resultsState.classList.add('hidden');
      uploadArea.classList.remove('hidden');
      selectedFile = null;
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