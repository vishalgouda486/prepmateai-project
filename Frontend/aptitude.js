document.addEventListener("DOMContentLoaded", () => {

        // --- Markdown to Beautiful HTML (Pro Mode) ---
    function convertMarkdownToProHTML(md) {
        if (!md) return "";

        // Convert ### headings
        md = md.replace(/^### (.*$)/gim, '<div class="ai-mini-heading">$1</div>');

        // Convert bullet points
        md = md.replace(/^- (.*$)/gim, '<div class="ai-bullet">• $1</div>');

        // Convert bold text
        md = md.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');

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

        // If user ended without answering anything
        if (practiceResults.length === 0) {
            feedbackReport.innerHTML = `
              <div class="apt-report">
                <p class="apt-empty-message">
                  You didn’t answer any questions. Try a short 3–5 question run to unlock a full visual report. 🚀
                </p>
              </div>
            `;
            return;
        }

        // --- Basic stats from practiceResults ---
        const totalQuestions = practiceResults.length;
        const correctCount = practiceResults.filter(r => r.is_correct).length;
        const accuracy = Math.round((correctCount / totalQuestions) * 100);

        const totalTime = practiceResults.reduce((sum, r) => {
            return sum + (r.time_taken_seconds || 0);
        }, 0);
        const avgTime = totalQuestions > 0 ? totalTime / totalQuestions : 0;

        let headline;
        if (accuracy >= 80) {
            headline = "🔥 Great job! You’re interview-ready in this topic.";
        } else if (accuracy >= 60) {
            headline = "💡 Good attempt! A bit more practice will make this solid.";
        } else {
            headline = "🌱 This is a safe space to improve. Let’s focus on basics and speed.";
        }

        // --- Build visual report UI ---
        feedbackReport.innerHTML = `
          <div class="apt-report">
            <div class="apt-report-header">
              <div>
                <h3 class="apt-report-title">Aptitude Practice Summary</h3>
                <p class="apt-report-subtitle">${headline}</p>
                <p class="apt-report-topic">
                  Topic selected: <span>${selectedTopic}</span><br>
                  Questions attempted: <span>${totalQuestions}</span>
                </p>
              </div>
              <div class="apt-score-wrapper" data-score="${accuracy}">
                <svg class="apt-score-ring" viewBox="0 0 140 140">
                  <circle class="apt-score-bg" cx="70" cy="70" r="60"></circle>
                  <circle class="apt-score-progress" cx="70" cy="70" r="60"></circle>
                </svg>
                <div class="apt-score-text">
                  <span class="apt-score-number">0</span>
                  <span class="apt-score-percent">%</span>
                </div>
              </div>
            </div>

            <div class="apt-metrics-grid">
              <div class="apt-metric-card">
                <div class="apt-metric-label">Questions Attempted</div>
                <div class="apt-metric-value">${totalQuestions}</div>
              </div>
              <div class="apt-metric-card">
                <div class="apt-metric-label">Correct Answers</div>
                <div class="apt-metric-value apt-good">${correctCount}</div>
              </div>
              <div class="apt-metric-card">
                <div class="apt-metric-label">Accuracy</div>
                <div class="apt-metric-value">${accuracy}%</div>
              </div>
              <div class="apt-metric-card">
                <div class="apt-metric-label">Avg Time / Question</div>
                <div class="apt-metric-value">${avgTime.toFixed(1)}s</div>
              </div>
            </div>

            <div class="apt-ai-pro-report">
                <h2 class="ai-pro-header">✨ AI Coach Insights (Pro Mode)</h2>

                <div class="ai-pro-section" id="ai-summary-section">
                    <h3><span>📘</span> Overall Summary</h3>
                    <div class="ai-pro-content" id="ai-summary"></div>
                </div>

                <div class="ai-pro-section" id="ai-strong-section">
                    <h3><span>🟦</span> Strongest Topic</h3>
                    <div class="ai-pro-content" id="ai-strong"></div>
                </div>

                <div class="ai-pro-section" id="ai-weak-section">
                    <h3><span>🟥</span> Weakest Topic</h3>
                    <div class="ai-pro-content" id="ai-weak"></div>
                </div>

                <div class="ai-pro-section" id="ai-keytakeaway-section">
                    <h3><span>💡</span> Key Takeaway</h3>
                    <div class="ai-pro-content" id="ai-keytakeaway"></div>
                </div>
            </div>

            </div> <!-- closes apt-report -->

            <div style="margin-top: 25px; text-align: center;">
                <button class="apt-report-button" onclick="location.href='practice.html'">
                    ⬅ Back to Practice Hub
                </button>
            </div>
        `;


        // --- Animate circular score (pie chart style) ---
        const circle = feedbackReport.querySelector(".apt-score-progress");
        if (circle) {
            const radius = 60;
            const circumference = 2 * Math.PI * radius;
            circle.style.strokeDasharray = `${circumference} ${circumference}`;
            circle.style.strokeDashoffset = `${circumference}`;

            // Trigger transition in next frame
            requestAnimationFrame(() => {
                const offset = circumference * (1 - accuracy / 100);
                circle.style.strokeDashoffset = `${offset}`;
            });
        }

        // Animate number from 0 -> accuracy
        const numberEl = feedbackReport.querySelector(".apt-score-number");
        if (numberEl) {
            let current = 0;
            const target = accuracy;
            const duration = 800; // ms
            const stepTime = 40;
            const step = Math.max(1, Math.round(target / (duration / stepTime)));

            const interval = setInterval(() => {
                current += step;
                if (current >= target) {
                    current = target;
                    clearInterval(interval);
                }
                numberEl.textContent = current;
            }, stepTime);
        }

        // --- Loading placeholders before AI report arrives ---
            document.getElementById("ai-summary").innerHTML =
                "<div class='ai-bullet'>⏳ Generating summary...</div>";
            document.getElementById("ai-strong").innerHTML =
                "<div class='ai-bullet'>⏳ Identifying your strongest topic...</div>";
            document.getElementById("ai-weak").innerHTML =
                "<div class='ai-bullet'>⏳ Analyzing weak areas...</div>";
            document.getElementById("ai-keytakeaway").innerHTML =
                "<div class='ai-bullet'>⏳ Preparing key takeaway...</div>";


        // --- Fetch AI text feedback and put into Pro Mode sections ---
        try {
            const response = await fetch("https://prepmate-backend-x77z.onrender.com/aptitude-feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ results: practiceResults }),
            });
            const data = await response.json();

            if (data.error) {
            document.getElementById("ai-summary").innerHTML =
                `<div class='ai-bullet'>⚠️ ${data.error}</div>`;
        } else {
            const fb = data.feedback;

            // Extract sections safely using regex
            const summaryMatch = fb.match(/### Overall Summary([\s\S]*?)### Strongest/);
            const strongMatch = fb.match(/### Strongest([\s\S]*?)### Weakest/);
            const weakMatch = fb.match(/### Weakest([\s\S]*?)### Key Takeaway/);
            const keyMatch = fb.match(/### Key Takeaway([\s\S]*)/);

            document.getElementById("ai-summary").innerHTML =
                convertMarkdownToProHTML(summaryMatch ? summaryMatch[1].trim() : "");

            document.getElementById("ai-strong").innerHTML =
                convertMarkdownToProHTML(strongMatch ? strongMatch[1].trim() : "");

            document.getElementById("ai-weak").innerHTML =
                convertMarkdownToProHTML(weakMatch ? weakMatch[1].trim() : "");

            document.getElementById("ai-keytakeaway").innerHTML =
                convertMarkdownToProHTML(keyMatch ? keyMatch[1].trim() : "");
        }

         } catch (error) {
            document.getElementById("ai-summary").innerHTML =
                "<div class='ai-bullet'>⚠️ Server not responding.</div>";
        }
        }

    function restartPractice() {
        feedbackScreen.classList.add("hidden");
        setupScreen.classList.remove("hidden");
    }
});