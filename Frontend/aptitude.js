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

    // ---------- PREMIUM REPORT MARKUP ----------
    feedbackReport.innerHTML = `
    <div class="premium-report-wrap">
      <div class="premium-header">
        <div>
          <h2>Practice Summary — PrepAura AI</h2>
          <div class="premium-sub">A compact, professional snapshot of your run.</div>
        </div>
        <div class="premium-spark" aria-hidden="true"></div>
      </div>

      <div class="premium-grid">
        <div class="score-card">
          <svg class="apt-score-ring" viewBox="0 0 140 140" role="img" aria-label="score ring">
            <circle class="apt-score-bg" cx="70" cy="70" r="60" stroke="rgba(255,255,255,0.06)" stroke-width="14" fill="none"></circle>
            <circle class="apt-score-progress" cx="70" cy="70" r="60" stroke="#38bdf8" stroke-width="14" stroke-linecap="round" fill="none" stroke-dasharray="0 999"></circle>
          </svg>

          <div class="apt-score-text-centered">
            <div class="num">${accuracy}</div>
            <div class="label">Overall Accuracy</div>
          </div>

          <div style="width:100%; display:flex; gap:10px; justify-content:center;">
            <div class="metric-mini" style="width:40%; text-align:center;">
              <div class="m-label">Questions</div>
              <div class="m-value">${total}</div>
            </div>
            <div class="metric-mini" style="width:40%; text-align:center;">
              <div class="m-label">Correct</div>
              <div class="m-value">${correct}</div>
            </div>
          </div>
        </div>

        <div>
          <div class="metrics-grid" style="margin-bottom:18px;">
            <div class="metric-mini"><div class="m-label">Avg Time</div><div class="m-value">${(practiceResults.reduce((s,r)=>s+(r.time_taken_seconds||0),0)/total).toFixed(1)}s</div></div>
            <div class="metric-mini"><div class="m-label">Accuracy</div><div class="m-value">${accuracy}%</div></div>
            <div class="metric-mini"><div class="m-label">Topic</div><div class="m-value">${selectedTopic || "Mix"}</div></div>
          </div>

          <div class="pro-blocks">
            <div class="pro-block">
              <h4>📘 Overall Summary</h4>
              <div id="ai-summary" class="ai-content"><div class="ai-loading"><div class="ai-dots"><span></span><span></span><span></span></div> Generating insights…</div></div>
            </div>

            <div class="pro-block">
              <h4>🟦 Strongest Topic</h4>
              <div id="ai-strong" class="ai-content"><div class="ai-loading"><div class="ai-dots"><span></span><span></span><span></span></div> Analyzing…</div></div>
            </div>

            <div class="pro-block">
              <h4>🟥 Weakest Topic</h4>
              <div id="ai-weak" class="ai-content"><div class="ai-loading"><div class="ai-dots"><span></span><span></span><span></span></div> Analyzing…</div></div>
            </div>
          </div>

          <div class="report-actions">
            <button id="download-report" class="btn-glass">Download Report (PNG)</button>
            <button id="back-to-hub" class="btn-gradient" onclick="location.href='practice.html'">← Back to Practice Hub</button>
          </div>
        </div>
      </div>

      <div style="margin-top:16px; display:flex; gap:12px; justify-content:center;">
        <button id="practice-again-bottom" class="btn-gradient">Practice Again</button>
      </div>
    </div>
    `;

    // ---------- animate ring ----------
    const circle = feedbackReport.querySelector(".apt-score-progress");
    if (circle) {
        const radius = 60;
        const circumference = 2 * Math.PI * radius;
        circle.style.strokeDasharray = `${circumference} ${circumference}`;
        circle.style.strokeDashoffset = `${circumference}`;

        // small delay for nicer effect
        setTimeout(() => {
            circle.style.transition = "stroke-dashoffset 900ms cubic-bezier(.22,.9,.26,1)";
            circle.style.strokeDashoffset = `${circumference * (1 - accuracy / 100)}`;
        }, 180);
    }

    // hook up Practice Again and Download
    document.getElementById("practice-again-bottom").addEventListener("click", restartPractice);

    // download as PNG (html2canvas light fallback)
    document.getElementById("download-report").addEventListener("click", async () => {
        // simple friendly loader
        const btn = document.getElementById("download-report");
        btn.innerText = "Preparing…";
        try {
            // try using html2canvas if available; if not, just open print dialog
            if (window.html2canvas) {
                const el = feedbackReport.querySelector(".premium-report-wrap");
                const canvas = await html2canvas(el, { scale:2, useCORS:true });
                const url = canvas.toDataURL("image/png");
                const a = document.createElement("a");
                a.href = url;
                a.download = `prepaura-report-${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            } else {
                // fallback to print (user can save as pdf/png via browser)
                window.print();
            }
        } catch (e) {
            console.warn(e);
            alert("Download failed. Try using the browser print/save as PDF option.");
        } finally {
            btn.innerText = "Download Report (PNG)";
        }
    });

    // ---------- fetch AI summary and render with markdown converter ----------
    try {
        const response = await fetch("https://prepmate-backend-x77z.onrender.com/aptitude-feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ results: practiceResults }),
        });
        const data = await response.json();

        if (data.error) {
            document.getElementById("ai-summary").innerText = data.error;
            document.getElementById("ai-strong").innerText = "–";
            document.getElementById("ai-weak").innerText = "–";
            return;
        }

        const fb = data.feedback || "";

        // Extract sections robustly
        const summary = (fb.split("### Strongest")[0] || "").replace("### Overall Summary", "").trim() || "No summary available.";
        const strongest = (fb.split("### Weakest")[0].split("### Strongest")[1] || "").trim() || "–";
        const weakest = (fb.split("### Key Takeaway")[0].split("### Weakest")[1] || "").trim() || "–";
        const keyTakeaway = (fb.split("### Key Takeaway")[1] || "").trim() || "–";

        // Convert markdown to pro HTML (uses your convertMarkdownToProHTML)
        document.getElementById("ai-summary").innerHTML = convertMarkdownToProHTML(summary);
        document.getElementById("ai-strong").innerHTML = convertMarkdownToProHTML(strongest);
        document.getElementById("ai-weak").innerHTML = convertMarkdownToProHTML(weakest);

        // Insert key takeaway block as a small pro-block below the three
        const keyBlock = document.createElement("div");
        keyBlock.className = "pro-block";
        keyBlock.innerHTML = `<h4>💡 Key Takeaway</h4><div class="ai-content">${convertMarkdownToProHTML(keyTakeaway)}</div>`;
        feedbackReport.querySelector(".premium-grid > div:nth-child(2)").appendChild(keyBlock);

    } catch (error) {
        document.getElementById("ai-summary").innerText = "⚠️ Server not responding.";
        document.getElementById("ai-strong").innerText = "–";
        document.getElementById("ai-weak").innerText = "–";
    }
}




    function restartPractice() {
        feedbackScreen.classList.add("hidden");
        setupScreen.classList.remove("hidden");
    }
});