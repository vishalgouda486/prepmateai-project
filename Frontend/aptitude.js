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

        // ------- UI STRUCTURE --------
        feedbackReport.innerHTML = `
        <div class="apt-report">
                
            <div class="apt-report-header">
                <div>
                    <h3>Aptitude Practice Summary</h3>
                    <p>Great effort! Here's how you performed 👇</p>
                </div>

                <div class="apt-score-wrapper">
                    <svg class="apt-score-ring" viewBox="0 0 140 140">
                    <circle class="apt-score-bg" cx="70" cy="70" r="60"></circle>
                    <circle class="apt-score-progress" cx="70" cy="70" r="60"></circle>
                    </svg>
                    <div class="apt-score-text">
                    <span class="apt-score-number">${accuracy}</span>
                    <span class="apt-score-percent">%</span>
                    </div>
                </div>
            </div>

            <div class="apt-metrics-grid">
                <div class="apt-metric">
                    <div class="m-label">Questions</div>
                    <div class="m-value">${total}</div>
                </div>
                <div class="apt-metric">
                    <div class="m-label">Correct</div>
                    <div class="m-value">${correct}</div>
                </div>
                <div class="apt-metric">
                    <div class="m-label">Accuracy</div>
                    <div class="m-value">${accuracy}%</div>
                </div>
            </div>

            <div class="ai-section">
                <h3>📘 Overall Summary</h3>
                <div id="ai-summary" class="ai-content">Loading...</div>
            </div>

            <div class="ai-section">
                <h3>🟦 Strongest Topic</h3>
                <div id="ai-strong" class="ai-content">Loading...</div>
            </div>

            <div class="ai-section">
                <h3>🟥 Weakest Topic</h3>
                <div id="ai-weak" class="ai-content">Loading...</div>
            </div>

            <div class="ai-section">
                <h3>💡 Key Takeaway</h3>
                <div id="ai-key" class="ai-content">Loading...</div>
            </div>

        </div>
        `;

        // ------- Animate Score Pie Chart -------
        // ------- Animate Score Pie Chart -------
            const circle = document.querySelector(".apt-score-progress");
            if (circle) {
                const radius = 60;
                const circumference = 2 * Math.PI * radius;
                circle.style.strokeDasharray = `${circumference}`;
                circle.style.strokeDashoffset = `${circumference}`;

                setTimeout(() => {
                    circle.style.strokeDashoffset = `${circumference * (1 - accuracy / 100)}`;
                }, 200);
            } else {
                // fallback safe: do nothing if the element isn't present
                console.warn("apt-score-progress element not found — skipping animation.");
            }


        // -------- Fetch AI Feedback --------
        try {
            const response = await fetch("https://prepmate-backend-x77z.onrender.com/aptitude-feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ results: practiceResults }),
            });

            const data = await response.json();

            if (data.error) {
                document.getElementById("ai-summary").innerText = data.error;
                return;
            }

            const fb = data.feedback || "";

            // safe defaults
            if (!fb) {
                document.getElementById("ai-summary").innerText = "No AI feedback received.";
                document.getElementById("ai-strong").innerText = "–";
                document.getElementById("ai-weak").innerText = "–";
                document.getElementById("ai-key").innerText = "–";
            } else {
                // Extract sections safely
                const summary = (fb.split("### Strongest")[0] || "").replace("### Overall Summary", "").trim() || "No summary available.";
                const strongest = (fb.split("### Weakest")[0].split("### Strongest")[1] || "").trim() || "–";
                const weakest = (fb.split("### Key Takeaway")[0].split("### Weakest")[1] || "").trim() || "–";
                const keyTakeaway = (fb.split("### Key Takeaway")[1] || "").trim() || "–";

                // Apply to UI
                document.getElementById("ai-summary").innerHTML = convertMarkdownToProHTML(summary);
                document.getElementById("ai-strong").innerHTML = convertMarkdownToProHTML(strongest);
                document.getElementById("ai-weak").innerHTML = convertMarkdownToProHTML(weakest);
                document.getElementById("ai-key").innerHTML = convertMarkdownToProHTML(keyTakeaway);
            }


        } catch (error) {
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