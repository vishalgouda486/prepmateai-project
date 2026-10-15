// --- ⭐️ NEW: Monaco Editor Loader ⭐️ ---
// This code configures and loads the Monaco Editor
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});
window.MonacoEnvironment = { getWorkerUrl: () => proxy };

let proxy = URL.createObjectURL(new Blob([`
    self.MonacoEnvironment = {
        baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/'
    };
    importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/base/worker/workerMain.min.js');
`], { type: 'text/javascript' }));
// --- End of Monaco Loader ---

// We must wait for the DOM *and* the editor to load
document.addEventListener("DOMContentLoaded", () => {
    function waitForMonaco() {
        if (typeof monaco !== 'undefined') {
            console.log("Monaco Editor loaded. Initializing app.");
            initializeApp();
        } else {
            console.log("Waiting for Monaco Editor...");
            setTimeout(waitForMonaco, 100);
        }
    }
    
    function waitForLoader() {
        if (typeof require !== 'undefined') {
            console.log("Monaco Loader loaded. Waiting for Editor...");
            require(["vs/editor/editor.main"], () => {
                waitForMonaco();
            });
        } else {
            console.log("Waiting for Monaco Loader...");
            setTimeout(waitForLoader, 100);
        }
    }
    
    waitForLoader();
});

function initializeApp() {
    // --- Get Elements ---
    const setupScreen = document.getElementById("setup-screen");
    const practiceScreen = document.getElementById("practice-screen");
    const loadingSpinner = document.getElementById("loading-spinner"); 
    const runningSpinner = document.getElementById("running-spinner");
    
    const languageSelect = document.getElementById("language-select");
    const topicSelect = document.getElementById("technical-topic");
    const startBtn = document.getElementById("start-btn");
    
    if (!setupScreen) {
      console.error("Setup screen not found!");
      return; 
    }

    const questionCounter = document.getElementById("question-counter");
    const questionTopic = document.getElementById("question-topic");
    const questionTimer = document.getElementById("question-timer");
    const questionText = document.getElementById("question-text");
    
    const editorLabel = document.getElementById("editor-label");
    const outputBox = document.getElementById("output-box");
    
    const runCodeBtn = document.getElementById("run-code-btn");
    const nextBtn = document.getElementById("next-btn");
    const endBtn = document.getElementById("end-btn");
    
    const solutionBtn = document.getElementById("solution-btn");
    const solutionBox = document.getElementById("solution-box");

    // --- Monaco Editor Setup ---
    const editorContainer = document.getElementById("code-editor-container");
    let codeEditor = monaco.editor.create(editorContainer, {
        value: "# Select a topic to start",
        language: "python",
        theme: "vs-dark",
        automaticLayout: true
    });

    // --- State Variables ---
    let selectedTopic = "";
    let selectedLanguage = "python";
    let questionCount = 0;
    let timerInterval;
    let timeTaken = 0;
    
    let currentQuestionData = null;
    let isFetching = false;
    
    let nextQuestionData = null; 
    let nextQuestionPromise = null; 

    // --- Event Listeners ---
    startBtn.addEventListener("click", startPractice);
    runCodeBtn.addEventListener("click", runCode);
    nextBtn.addEventListener("click", nextQuestion);
    endBtn.addEventListener("click", endPractice);
    solutionBtn.addEventListener("click", showSolution);
    
    languageSelect.addEventListener("change", () => {
        selectedLanguage = languageSelect.value;
        monaco.editor.setModelLanguage(codeEditor.getModel(), selectedLanguage);
        editorLabel.innerText = `Your Code (${selectedLanguage === 'java' ? 'Java' : 'Python 3'}):`;
    });
    
    // --- Core Functions ---
    
    async function startPractice() {
        selectedTopic = topicSelect.value;
        selectedLanguage = languageSelect.value;

        if (!selectedTopic || !selectedLanguage) {
            alert("Please select a topic and language.");
            return;
        }

        questionCount = 0;
        
        setupScreen.classList.add("hidden");
        practiceScreen.classList.remove("hidden");
        
        loadingSpinner.style.display = "flex";
        
        monaco.editor.setModelLanguage(codeEditor.getModel(), selectedLanguage);
        editorLabel.innerText = `Your Code (${selectedLanguage === 'java' ? 'Java' : 'Python 3'}):`;
        
        currentQuestionData = await fetchQuestion();
        if (currentQuestionData) {
            nextQuestionPromise = fetchQuestion();
            nextQuestionPromise.then(data => { 
                nextQuestionData = data; 
                if(data) console.log("Pre-fetch complete.");
            });
            
            questionCount = 1;
            displayQuestion(currentQuestionData);
        } else {
            restartPractice();
        }

        // ❌ Removed old spinner hide here
    }

    async function fetchQuestion() {
        if (isFetching) return null; 
        isFetching = true;
        
        if (!nextQuestionPromise) {
            loadingSpinner.style.display = "flex";
        }
        
        try {
            const response = await fetch("https://prepmateai-project-production.up.railway.app/technical-question", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    topic: selectedTopic,
                    language: selectedLanguage
                }),
            });
            const data = await response.json();
            isFetching = false;
            
            if (!nextQuestionPromise) {
                loadingSpinner.style.display = "none";
            }
            
            if (data.error) {
                alert(`Error: ${data.error}. Please try again.`);
                return null;
            }
            return data; 
            
        // New catch block for fetchQuestion()

        } catch (error) {
            isFetching = false;
            if (!nextQuestionPromise) {
                loadingSpinner.style.display = "none";
            }
            
            // ✅ FIX: Improved Error Handling & Restart Logic
            if (questionCount === 0) {
                // If this is the FIRST question (questionCount is 0 here, 
                // but becomes 1 later in startPractice if successful)
                alert("⚠️ Failed to connect to backend server. Please check the service status and try again.");
                // We don't call restartPractice here, we rely on the logic in startPractice()
                // after it receives 'null' from fetchQuestion().
            } else {
                 // For subsequent questions
                 alert("⚠️ Server not responding while fetching next question. Make sure backend is running.");
                 // We don't call restartPractice here, we rely on the logic in nextQuestion()
                 // after it receives 'null' from the promise.
            }
            
            // The main logic in startPractice() already handles the restart if this returns null:
            // if (currentQuestionData) { ... } else { restartPractice(); }
            return null;
        }
    }

    function displayQuestion(data) {
        // ✅ FIX: Stop buffer when question is displayed
        loadingSpinner.style.display = "none";

        questionText.innerHTML = `<strong>${data.question_title}</strong><br>${data.problem_statement}`;
        questionCounter.innerText = `Question: ${questionCount}`;
        questionTopic.innerText = `Topic: ${selectedTopic}`;
        
        let emptyTemplate = data.starter_code;
        if (!emptyTemplate) {
            if (selectedLanguage === 'python') {
                emptyTemplate = `# Write your Python code here\n# Use input() and print()`;
            } else {
                emptyTemplate = `// Write your Java code here\n// Use Scanner(System.in)`;
            }
        }
        
        codeEditor.setValue(emptyTemplate);
        
        outputBox.innerHTML = "Click 'Run Code' to see your test case results...";
        nextBtn.disabled = true;
        
        solutionBtn.classList.remove("hidden");
        solutionBox.classList.add("hidden");
        
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
    
    async function runCode() {
        clearInterval(timerInterval);
        runningSpinner.style.display = "flex"; 
        
        const userCode = codeEditor.getValue();
        
        try {
            const response = await fetch("https://prepmateai-project-production.up.railway.app/run-code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_code: userCode,
                    language: selectedLanguage,
                    function_name: currentQuestionData.function_name,
                    test_cases: currentQuestionData.test_cases
                }),
            });
            
            const data = await response.json();
            
            outputBox.innerHTML = ""; 
            if (data.error) {
                outputBox.innerHTML = `<span class="error">Error: ${data.error}</span>`;
                if(data.compile_output) outputBox.innerHTML += `\n\nCompile Error:\n${data.compile_output}`;
                if(data.stderr) outputBox.innerHTML += `\n\nRuntime Error:\n${data.stderr}`;
            } else if (data.results) {
                let all_passed = true;
                data.results.forEach(result => {
                    if (result.includes("PASSED")) {
                        outputBox.innerHTML += `<span class="pass">${result}</span>\n`;
                    } else {
                        outputBox.innerHTML += `<span class="fail">${result}</span>\n`;
                        all_passed = false;
                    }
                });
                
                if (all_passed) {
                    nextBtn.disabled = false;
                }
            }
            
        } catch (error) {
            outputBox.innerHTML = `<span class="error">⚠️ Server not responding. Make sure backend is running.</span>`;
        }
        
        runningSpinner.style.display = "none";
    }

    async function nextQuestion() {
        if (nextQuestionData) {
            console.log("Pre-fetch successful. Displaying instantly.");
            questionCount++;
            currentQuestionData = nextQuestionData;
            nextQuestionData = null; 
            
            displayQuestion(currentQuestionData);
            
            nextQuestionPromise = fetchQuestion();
            nextQuestionPromise.then(data => { 
                nextQuestionData = data; 
                if(data) console.log("Pre-fetch complete.");
            });
            
        } else {
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
                nextQuestionPromise.then(data => { 
                    nextQuestionData = data; 
                    if(data) console.log("Pre-fetch complete.");
                });
                
            } else {
                alert("Failed to fetch next question. Ending practice session.");
                endPractice();
            }
        }
    }
    
    function showSolution() {
        const modelSolution = currentQuestionData.model_solution;
        if (modelSolution) {
            solutionBox.innerText = modelSolution;
            solutionBox.classList.toggle("hidden");
        } else {
            solutionBox.innerText = "No model solution available for this problem.";
            solutionBox.classList.toggle("hidden");
        }
    }

    function endPractice() {
        clearInterval(timerInterval); 
        window.location.href = "practice.html";
    }
    
    function restartPractice() {
        practiceScreen.classList.add("hidden");
        setupScreen.classList.remove("hidden");
    }
}