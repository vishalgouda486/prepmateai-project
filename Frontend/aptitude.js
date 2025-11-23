document.addEventListener("DOMContentLoaded", () => {

    // --- PRO MODE MARKDOWN → HTML CONVERTER ---
    function convertMarkdownToProHTML(md) {
        if (!md) return "";

        // Headings
        md = md.replace(/^### (.*$)/gim, '<div class="ai-mini-heading">$1</div>');

        // Bullets
        md = md.replace(/^- (.*$)/gim, '<div class="ai-bullet">• $1</div>');

        // Bold
        md = md.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');

        // Inline code
        md = md.replace(/`(.*?)`/gim, '<code class="ai-inline-code">$1</code>');

        // New lines
        md = md.replace(/\n/g, '<br>');

        return md;
    }

    // --- Get Elements ---
    const setupScreen = document.getElementById("setup-screen");
    const practiceScreen = document.getElementById("practice-screen");
    const feedbackScreen = document.getElementById("feedback-screen");
    const loadingSpinner = document.getElementById("loading-spinner"); 
    
    const topicSelect = document.getElementById("aptitude-topic");
    const startBtn = document.getElementById("start-btn");
    
    const questionCounter = document.getElementById("question-counter");
    const questionTopic = document.getElementById("question-topic");
    const questionTimer = document.getElementById("question-timer");
    const questionText = document.getElementById("question-text");
    const optionsGrid = document.getElementById("options-grid");
    
    const solutionBox = document.getElementById("solution-box");
    
    const submitBtn = document.getElementById("submit-btn");
    const nextBtn = document.getElementById("next-btn");
    const solutionBtn = document.getElementById("solution-btn");
    const endBtn = document.getElementById("end-btn");
    
    const feedbackReport = document.getElementById("feedback-report");
    const restartBtn = document.getElementById("restart-btn");

    // --- State Variables ---
    let selectedTopic = "";
    let questionCount = 0;
    let timerInterval;
    let timeTaken = 0;
    
    let practiceResults = []; 
    let currentQuestionData = null;
    let nextQuestionData = null; 
    let selectedAnswer = null;
    let isFetching = false;
    
    // ⭐️ NEW: A variable to store the promise for the next fetch
    let nextQuestionPromise = null; 

    // --- Event Listeners ---
    startBtn.addEventListener("click", startPractice);
    submitBtn.addEventListener("click", submitAnswer);
    nextBtn.addEventListener("click", nextQuestion);
    solutionBtn.addEventListener("click", showSolution);
    endBtn.addEventListener("click", endPractice);
    restartBtn.addEventListener("click", restartPractice);

    // --- Core Functions ---

    async function startPractice() {
        selectedTopic = topicSelect.value;
        practiceResults = [];
        questionCount = 0;
        
        setupScreen.classList.add("hidden");
        feedbackScreen.classList.add("hidden");
        practiceScreen.classList.remove("hidden");
        
        loadingSpinner.style.display = "flex";
        
        currentQuestionData = await fetchQuestion(); // Fetch Q1
        if (currentQuestionData) {
            // Start fetching Q2 in the background
            nextQuestionPromise = fetchQuestion(); 
            nextQuestionPromise.then(data => { nextQuestionData = data; });
            
            questionCount = 1;
            displayQuestion(currentQuestionData);
        } else {
            // Failed to get first question
            restartPractice();
        }
        
        loadingSpinner.style.display = "none";
    }

    async function fetchQuestion() {
        if (isFetching) return null; 
        isFetching = true;
        
        try {
            const response = await fetch("https://prepmate-backend-x77z.onrender.com/aptitude-question", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic: selectedTopic }),
            });
            const data = await response.json();
            isFetching = false;
            
            if (data.error) {
                alert(`Error: ${data.error}. Please try again.`);
                return null;
            }
            return data; 
            
        } catch (error) {
            isFetching = false;
            // Only show alert if it's not the initial load
            if (questionCount > 0) {
                alert("⚠️ Server not responding. Make sure backend is running.");
            }
            return null;
        }
    }

    function displayQuestion(data) {
        questionText.innerText = data.question;
        questionCounter.innerText = `Question: ${questionCount}`;
        questionTopic.innerText = `Topic: ${selectedTopic}`;
        optionsGrid.innerHTML = "";
        solutionBox.innerHTML = "";
        solutionBox.classList.add("hidden");
        
        submitBtn.classList.remove("hidden");
        nextBtn.classList.add("hidden");
        solutionBtn.classList.add("hidden");
        submitBtn.disabled = true;
        
        selectedAnswer = null;

        data.options.forEach(optionText => {
            const option = document.createElement("div");
            option.classList.add("option");
            option.innerText = optionText;
            
            option.addEventListener("click", () => {
                document.querySelectorAll(".option").forEach(opt => opt.classList.remove("selected"));
                option.classList.add("selected");
                selectedAnswer = optionText;
                submitBtn.disabled = false;
            });
            optionsGrid.appendChild(option);
        });
        
        startTimer();
    }

    function startTimer() {
        timeTaken = 0;
        questionTimer.innerText = "Time: 0s";
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            timeTaken++;
            questionTimer.innerText = `Time: ${timeTaken}s`;
        }, 1000);
    }

    function submitAnswer() {
        clearInterval(timerInterval);
        
        const isCorrect = (selectedAnswer === currentQuestionData.correct_answer);
        
        practiceResults.push({
            topic: selectedTopic,
            question: currentQuestionData.question,
            user_answer: selectedAnswer,
            correct_answer: currentQuestionData.correct_answer,
            is_correct: isCorrect,
            time_taken_seconds: timeTaken
        });
        
        document.querySelectorAll(".option").forEach(option => {
            option.classList.add("disabled");
            if (option.innerText === currentQuestionData.correct_answer) {
                option.classList.add("correct");
            } else if (option.innerText === selectedAnswer) {
                option.classList.add("incorrect");
            }
        });
        
        submitBtn.classList.add("hidden");
        nextBtn.classList.remove("hidden");
        solutionBtn.classList.remove("hidden");
    }

    function showSolution() {
        solutionBox.innerText = currentQuestionData.solution;
        solutionBox.classList.toggle("hidden");
    }

    async function nextQuestion() {
        
        if (nextQuestionData) {
            // --- FAST PATH ---
            console.log("Pre-fetch successful. Displaying instantly.");
            questionCount++;
            currentQuestionData = nextQuestionData;
            nextQuestionData = null; 
            
            displayQuestion(currentQuestionData);
            
            nextQuestionPromise = fetchQuestion();
            nextQuestionPromise.then(data => { nextQuestionData = data; });
            
        } else {
            // --- SLOW PATH ---
            console.log("Pre-fetch not ready. Waiting for it to complete...");
            loadingSpinner.style.display = "flex";
            
            const data = await nextQuestionPromise; 
            
            loadingSpinner.style.display = "none";
            
            if (data) {
                questionCount++;
                currentQuestionData = data;
                nextQuestionData = null; 
                
                displayQuestion(currentQuestionData);
                
                nextQuestionPromise = fetchQuestion();
                nextQuestionPromise.then(data => { nextQuestionData = data; });
                
            } else {
                alert("Failed to fetch next question. Ending practice session.");
                endPractice();
            }
        }
    }

    async function endPractice() {
        clearInterval(timerInterval);

        practiceScreen.classList.add("hidden");
        feedbackScreen.classList.remove("hidden");

        // Basic Stats
        const total = practiceResults.length;
        if (total === 0) {
            feedbackReport.innerText = "You did not complete any questions. Practice again to get a report.";
            return;
        }
        const correct = practiceResults.filter(r => r.is_correct).length;
        const accuracy = Math.round((correct / total) * 100);

        // Build premium cyberpunk report UI
        feedbackReport.innerHTML = `
          <div class="apt-report">
            <h3>Practice Report — PrepAura AI</h3>
            <div class="subtitle">Your personalised, AI-powered analysis. Compact, actionable, cyberpunk.</div>

            <div class="report-top-row">
              <!-- LEFT: Big score ring -->
              <div class="apt-score-wrapper">
                <svg class="apt-score-ring" viewBox="0 0 140 140">
                  <circle class="apt-score-bg" cx="70" cy="70" r="60" stroke-width="12" fill="none" stroke="rgba(30,40,50,0.5)"></circle>
                  <circle class="apt-score-progress" cx="70" cy="70" r="60" stroke-width="12" fill="none" stroke="#3ab7ff" stroke-linecap="round" transform="rotate(-90 70 70)"></circle>
                </svg>
                <div class="apt-score-text">
                  <div class="apt-score-number">${accuracy}</div>
                  <div class="apt-score-percent">%</div>
                </div>
              </div>

              <!-- RIGHT: small stats -->
              <div>
                <div class="report-stats">
                  <div class="stat-card">
                    <div class="label">Avg Time</div>
                    <div class="value">${(practiceResults.reduce((s,r)=>s+(r.time_taken_seconds||0),0)/total).toFixed(1)}s</div>
                  </div>
                  <div class="stat-card">
                    <div class="label">Accuracy</div>
                    <div class="value">${accuracy}%</div>
                  </div>
                  <div class="stat-card">
                    <div class="label">Topic</div>
                    <div class="value">${selectedTopic || "Mix"}</div>
                  </div>
                </div>

                <div class="mini-legend">
                  <div>● <strong>Overall</strong></div>
                  <div style="opacity:.8">● <strong>Strongest</strong></div>
                  <div style="opacity:.7">● <strong>Weakest</strong></div>
                </div>
              </div>
            </div>

            <!-- AI cards -->
            <div class="ai-cards-grid" style="margin-top:22px;">
              <div class="ai-card">
                <h4>📘 Overall Summary</h4>
                <div id="ai-summary" class="ai-content">Generating summary...</div>
              </div>
              <div class="ai-card">
                <h4>🟦 Strongest Topic</h4>
                <div id="ai-strong" class="ai-content">Analysing strongest topic...</div>
              </div>
              <div class="ai-card">
                <h4>🟥 Weakest Topic</h4>
                <div id="ai-weak" class="ai-content">Analysing weak areas...</div>
              </div>
              <div class="ai-card">
                <h4>💡 Key Takeaway</h4>
                <div id="ai-key" class="ai-content">Preparing key takeaway...</div>
              </div>
            </div>

            <div class="apt-report-footer">
              <div>
                <button id="download-report-btn" class="btn-ghost">Download Report (PNG)</button>
              </div>
              <div style="display:flex;gap:10px">
                <button id="back-report-btn" class="btn-ghost" onclick="location.href='practice.html'">⬅ Back to Practice Hub</button>
                <button id="practice-again-btn" class="btn-primary">Practice Again</button>
              </div>
            </div>
          </div>
        `;

        // Animate the circular ring stroke
        (function animateRing() {
            const circle = feedbackReport.querySelector(".apt-score-progress");
            if (!circle) return;
            const radius = 60;
            const circumference = 2 * Math.PI * radius;
            circle.style.strokeDasharray = `${circumference} ${circumference}`;
            circle.style.strokeDashoffset = `${circumference}`;
            // small easing animation to final offset
            setTimeout(() => {
                circle.style.transition = "stroke-dashoffset 900ms cubic-bezier(.2,.9,.2,1)";
                circle.style.strokeDashoffset = `${circumference * (1 - accuracy / 100)}`;
            }, 120);
        })();

        // Hook up "Practice Again" to restart
        document.getElementById("practice-again-btn").addEventListener("click", () => {
            restartPractice();
            // scroll to top of setup
            window.scrollTo({ top: 0, behavior: "smooth" });
        });

        // Optional: small download (html2canvas-lite approach)
        const downloadBtn = document.getElementById("download-report-btn");
        downloadBtn.addEventListener("click", async () => {
            // lightweight screenshot using browser's built-in SVG + CSS snapshot
            try {
                downloadBtn.disabled = true;
                downloadBtn.textContent = "Preparing...";
                // create canvas using HTML2Canvas if available — fallback to printing message
                if (window.html2canvas) {
                    const node = feedbackReport.querySelector(".apt-report");
                    const canvas = await window.html2canvas(node, { backgroundColor: null });
                    const dataUrl = canvas.toDataURL("image/png");
                    const a = document.createElement("a");
                    a.href = dataUrl;
                    a.download = `prepaura-report-${Date.now()}.png`;
                    a.click();
                } else {
                    // fallback: open print view (user can save as PDF)
                    window.print();
                }
            } finally {
                downloadBtn.disabled = false;
                downloadBtn.textContent = "Download Report (PNG)";
            }
        });

        // Fetch AI feedback and render into cards (use your existing endpoint)
        try {
            const resp = await fetch("https://prepmate-backend-x77z.onrender.com/aptitude-feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ results: practiceResults }),
            });
            const json = await resp.json();
            if (json.error) {
                document.getElementById("ai-summary").innerText = `⚠️ ${json.error}`;
                document.getElementById("ai-strong").innerText = "–";
                document.getElementById("ai-weak").innerText = "–";
                document.getElementById("ai-key").innerText = "–";
                return;
            }
            const fb = json.feedback || "";

            // Extract sections using robust regex & convert to pro HTML if converter exists
            const summaryMatch = fb.match(/### Overall Summary([\s\S]*?)### Strongest/);
            const strongMatch = fb.match(/### Strongest([\s\S]*?)### Weakest/);
            const weakMatch = fb.match(/### Weakest([\s\S]*?)### Key Takeaway/);
            const keyMatch = fb.match(/### Key Takeaway([\s\S]*)/);

            const conv = (txt) => {
                if (typeof convertMarkdownToProHTML === "function") return convertMarkdownToProHTML(txt || "");
                return (txt || "").replace(/\n/g,"<br>");
            };

            document.getElementById("ai-summary").innerHTML = conv(summaryMatch ? summaryMatch[1].trim() : fb.slice(0,350) + (fb.length>350?"...":""));
            document.getElementById("ai-strong").innerHTML = conv(strongMatch ? strongMatch[1].trim() : "");
            document.getElementById("ai-weak").innerHTML = conv(weakMatch ? weakMatch[1].trim() : "");
            document.getElementById("ai-key").innerHTML = conv(keyMatch ? keyMatch[1].trim() : "");
        } catch (err) {
            document.getElementById("ai-summary").innerText = "⚠️ Server not responding.";
            document.getElementById("ai-strong").innerText = "–";
            document.getElementById("ai-weak").innerText = "–";
            document.getElementById("ai-key").innerText = "–";
        }
    }

    function restartPractice() {
        feedbackScreen.classList.add("hidden");
        setupScreen.classList.remove("hidden");
    }
});