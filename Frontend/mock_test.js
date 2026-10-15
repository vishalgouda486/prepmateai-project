// --- Monaco Editor Loader ---
// This is required for the coding round
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});
window.MonacoEnvironment = { getWorkerUrl: () => proxy };

let proxy = URL.createObjectURL(new Blob([`
    self.MonacoEnvironment = {
        baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/'
    };
    importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/base/worker/workerMain.min.js');
`], { type: 'text/javascript' }));
// --- End of Monaco Loader ---


document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. Get All Page Elements ---
    const mainNavbar = document.getElementById("main-navbar");
    const testContainer = document.getElementById("mock-test-container");

    // Screens
    const setupScreen = document.getElementById("setup-screen");
    const readyScreen = document.getElementById("ready-screen");
    const testEnvironment = document.getElementById("test-environment");
    const reportScreen = document.getElementById("report-screen");

    // Setup Elements
    const resumeUploadInput = document.getElementById("resume-upload");
    const uploadBtn = document.getElementById("upload-btn");
    const skipResumeBtn = document.getElementById("skip-resume-btn");
    const resumeStatus = document.getElementById("resume-status");
    const languageSelect = document.getElementById("language-select");
    const startTestBtn = document.getElementById("start-test-btn");

    // Ready Screen
    const beginTestBtn = document.getElementById("begin-test-btn");

    // Proctoring Header
    const roundName = document.getElementById("round-name");
    const masterTimerEl = document.getElementById("master-timer");
    const warningCount = document.getElementById("warning-count");
    
    // Content Area
    const roundContent = document.getElementById("round-content");

    // Report Screen
    const finalReportBox = document.getElementById("final-report-box");

    // --- 2. Test State Variables ---
    let testState = {
        resumeText: null,
        codingLanguage: "python",
        currentRound: 0, 
        warnings: 0,
        masterTimerInterval: null,
        
        aptitude: {
            currentQuestion: null,
            nextQuestion: null,
            nextQuestionPromise: null,
            isFetching: false,
            currentIndex: 0, 
            selectedAnswer: null,
            ui: { /* ... */ }
        },
        
        communication: {
            roundTimerInterval: null,
            mediaRecorder: null,
            audioChunks: [],
            recordedAudioBlob: null,
            localStream: null,
            faceDetectionInterval: null,
            expressionData: [],
            currentTopic: "",
            isSubmitting: false, 
            ui: { /* ... */ }
        },
        
        coding: {
            editor: null, 
            currentQuestionData: null,
            nextQuestion: null,
            nextQuestionPromise: null,
            currentIndex: 0, 
            isFetching: false,
            isRunning: false,
            ui: { /* ... */ }
        },
        
        interview: {
            conversationHistory: [],
            questionNumber: 0, 
            mediaRecorder: null,
            audioChunks: [],
            recordedAudioBlob: null,
            localStream: null,
            faceDetectionInterval: null,
            expressionData: [],
            speechVoices: [],
            isMuted: false,
            isSubmitting: false,
            ui: { /* ... */ }
        },
        
        allRoundResults: {
            aptitude: [],
            communication: null, 
            coding: [],
            interview: [] 
        }
    };

    // --- 3. Setup Listeners ---
    uploadBtn.addEventListener("click", handleResumeUpload);
    skipResumeBtn.addEventListener("click", handleSkipResume);
    languageSelect.addEventListener("change", (e) => {
        testState.codingLanguage = e.target.value;
    });
    startTestBtn.addEventListener("click", () => {
        setupScreen.classList.add("hidden");
        readyScreen.classList.remove("hidden");
    });
    beginTestBtn.addEventListener("click", startTest);

    function loadVoices() {
        testState.interview.speechVoices = window.speechSynthesis.getVoices();
    }
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();

    async function handleResumeUpload() {
        const file = resumeUploadInput.files[0];
        if (!file) {
            resumeStatus.innerText = "Please select a file first.";
            return;
        }
        resumeStatus.innerText = "Uploading...";
        const formData = new FormData();
        formData.append("resume_file", file);
        try {
            const response = await fetch("https://prepmateai-project-production.up.railway.app/upload-practice-resume", {
                method: "POST",
                body: formData,
            });
            const data = await response.json();
            if (data.error) {
                resumeStatus.innerText = `Error: ${data.error}`;
            } else {
                testState.resumeText = data.resume_text;
                resumeStatus.innerText = "✅ Resume Uploaded!";
                uploadBtn.disabled = true;
                skipResumeBtn.disabled = true;
                startTestBtn.disabled = false;
            }
        } catch (error) {
            resumeStatus.innerText = "⚠️ Server not responding.";
            console.error("Upload error:", error);
        }
    }
    
    function handleSkipResume() {
        testState.resumeText = null;
        resumeStatus.innerText = "Resume skipped.";
        uploadBtn.disabled = true;
        skipResumeBtn.disabled = true;
        startTestBtn.disabled = false;
    }

    // --- 4. Proctoring & Fullscreen Logic ---
    async function startTest() {
        readyScreen.classList.add("hidden");
        testEnvironment.classList.remove("hidden");
        mainNavbar.classList.add("hidden");
        
        try {
            await document.documentElement.requestFullscreen();
        } catch (err) {
            console.warn(`Error attempting to enable fullscreen: ${err.message}`);
        }
        
        document.addEventListener("visibilitychange", handleVisibilityChange);

        roundContent.innerHTML = `
            <div class.container" style="max-width: 900px; box-shadow: none; padding-top: 0;">
                <div id="aptitude-loading" class="spinner-overlay" style="display: flex; position: relative; background: rgba(255,255,255,0.8); border-radius: 8px; min-height: 400px;">
                    <div class="spinner"></div>
                    <p id="aptitude-loading-text">Loading AI Face Models...</p>
                </div>
            </div>`;
        try {
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
                faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
                faceapi.nets.faceExpressionNet.loadFromUri('/models')
            ]);
            startAptitudeRound();
        } catch (error) {
            document.getElementById("aptitude-loading-text").innerText = "❌ Error loading local AI models. Check the /models folder and refresh.";
            console.error("Error loading face-api models:", error);
        }
    }
    
    function handleVisibilityChange() {
        if (testState.currentRound === 0 || testState.currentRound > 4) {
            return;
        }
        if (document.visibilityState === "hidden") {
            testState.warnings++;
            warningCount.innerText = `${testState.warnings} / 3`;
            if (testState.warnings >= 3) {
                endTest("Test ended due to switching tabs 3 times.");
            } else {
                alert(`Warning ${testState.warnings}: You have left the test tab. This will be recorded. Three warnings will end the test.`);
            }
        }
    }

    function startMasterTimer(durationInMinutes, onTimeUp) {
        clearInterval(testState.masterTimerInterval);
        let totalSeconds = durationInMinutes * 60;
        
        const updateTimer = () => {
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            masterTimerEl.innerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            if (totalSeconds <= 0) {
                clearInterval(testState.masterTimerInterval);
                onTimeUp(); 
            }
            totalSeconds--;
        };
        
        updateTimer();
        testState.masterTimerInterval = setInterval(updateTimer, 1000);
    }
    
    // ⭐️ --- UPDATED: endTest FUNCTION --- ⭐️
    function endTest(reason) {
        // Stop all timers and media recorders
        clearInterval(testState.masterTimerInterval);
        clearInterval(testState.communication.roundTimerInterval);
        if (testState.communication.mediaRecorder) {
            stopCommunicationRecording();
        }
        if (testState.coding.editor) {
            testState.coding.editor.dispose();
            testState.coding.editor = null;
        }
        if (testState.interview.mediaRecorder) {
            stopInterviewRecording();
        }
        
        // Clean up proctoring
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
        
        // Show the report screen
        testEnvironment.classList.add("hidden");
        reportScreen.classList.remove("hidden");
        mainNavbar.classList.remove("hidden");
        
        // Call the new report generation function
        generateAndShowFinalReport(reason);
    }

    // ⭐️ --- NEW: Final Report Function --- ⭐️
    async function generateAndShowFinalReport(reason) {
        finalReportBox.innerText = `Test Ended. ${reason}\n\nGenerating your comprehensive report... This may take a moment.`;
        
        console.log("Final results payload:", testState.allRoundResults);

        try {
            const response = await fetch("https://prepmateai-project-production.up.railway.app/generate-final-report", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ all_round_results: testState.allRoundResults })
            });
            const data = await response.json();
            
            if (data.error) {
                finalReportBox.innerText = `Error generating report: ${data.error}`;
            } else {
                // We will use innerHTML here to render the Markdown formatting
                finalReportBox.innerHTML = data.report;
            }
        } catch (error) {
            finalReportBox.innerText = `Error generating report: Could not connect to the server. Please check the console.`;
            console.error("Final report error:", error);
        }
    }


    // --- 5. Round Logic ---
    
    // --- Round 1: Aptitude (Complete) ---
    function loadAptitudeUI() {
        roundContent.innerHTML = `
            <div class="container" style="max-width: 900px; box-shadow: none; padding-top: 0;">
                <div id="aptitude-loading" class="spinner-overlay" style="position: relative; background: rgba(255,255,255,0.8); border-radius: 8px; min-height: 400px;">
                    <div class="spinner"></div>
                    <p id="aptitude-loading-text">Preparing a test tailored specially for you...</p>
                </div>
                <div id="aptitude-content" style="display: none;">
                    <h2 id="aptitude-question-counter" style="text-align: left; margin-top: 0;">Question 1 of 20</h2>
                    <div class="question-box" id="aptitude-question-text"></div>
                    <div class="options-grid" id="aptitude-options-grid"></div>
                    <div class="nav-button-row" style="margin-top: 20px;">
                        <button id="aptitude-skip-btn" class="tool-button-danger">Temp: Skip to Next Round</button>
                        <button id="aptitude-next-btn" class="tool-button-primary">Next</button>
                    </div>
                </div>
            </div>`;
        testState.aptitude.ui = {
            loadingSpinner: document.getElementById("aptitude-loading"),
            loadingText: document.getElementById("aptitude-loading-text"),
            content: document.getElementById("aptitude-content"),
            counter: document.getElementById("aptitude-question-counter"),
            questionText: document.getElementById("aptitude-question-text"),
            optionsGrid: document.getElementById("aptitude-options-grid"),
            nextBtn: document.getElementById("aptitude-next-btn"),
            skipBtn: document.getElementById("aptitude-skip-btn")
        };
        testState.aptitude.ui.skipBtn.addEventListener("click", endAptitudeRound);
        testState.aptitude.ui.nextBtn.addEventListener("click", handleAptitudeNextClick);
    }
    async function fetchNextAptitudeQuestion() {
        if (testState.aptitude.isFetching) return null;
        testState.aptitude.isFetching = true;
        try {
            const response = await fetch("https://prepmateai-project-production.up.railway.app/aptitude-question", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic: "Mix" }),
            });
            const data = await response.json();
            testState.aptitude.isFetching = false;
            if (data.error) {
                alert(`Error fetching next question: ${data.error}`);
                return null;
            }
            return data;
        } catch (error) {
            testState.aptitude.isFetching = false;
            alert(`Error fetching next question: Server not responding.`);
            return null;
        }
    }
    function displayAptitudeQuestion(question) {
        const { ui } = testState.aptitude;
        const index = testState.aptitude.currentIndex;
        if (!ui.counter) return; 
        ui.counter.innerText = `Question ${index + 1} of 20`;
        ui.questionText.innerText = question.question;
        ui.optionsGrid.innerHTML = "";
        testState.aptitude.selectedAnswer = null;
        ui.nextBtn.disabled = true;
        if (index === 19) { 
            ui.nextBtn.innerText = "Finish Round";
        } else {
            ui.nextBtn.innerText = "Next";
        }
        question.options.forEach(optionText => {
            const option = document.createElement("div");
            option.classList.add("option");
            option.innerText = optionText;
            option.addEventListener("click", () => {
                document.querySelectorAll(".option").forEach(opt => opt.classList.remove("selected"));
                option.classList.add("selected");
                testState.aptitude.selectedAnswer = optionText;
                ui.nextBtn.disabled = false;
            });
            ui.optionsGrid.appendChild(option);
        });
    }
    async function handleAptitudeNextClick() {
        const { currentQuestion, currentIndex, selectedAnswer, nextQuestion, nextQuestionPromise, ui } = testState.aptitude;
        testState.allRoundResults.aptitude.push({
            question: currentQuestion.question,
            user_answer: selectedAnswer,
            correct_answer: currentQuestion.correct_answer,
            is_correct: selectedAnswer === currentQuestion.correct_answer
        });
        if (currentIndex === 19) {
            endAptitudeRound();
            return;
        }
        testState.aptitude.currentIndex++;
        if (nextQuestion) {
            testState.aptitude.currentQuestion = nextQuestion;
            testState.aptitude.nextQuestion = null; 
            if (testState.aptitude.currentIndex < 19) {
                testState.aptitude.nextQuestionPromise = fetchNextAptitudeQuestion();
                testState.aptitude.nextQuestionPromise.then(q => { testState.aptitude.nextQuestion = q; });
            }
            displayAptitudeQuestion(testState.aptitude.currentQuestion);
        } else {
            ui.content.style.display = "none";
            ui.loadingSpinner.style.display = "flex";
            ui.loadingText.innerText = "Loading next question...";
            const nextQ = await nextQuestionPromise;
            ui.loadingSpinner.style.display = "none";
            ui.content.style.display = "block";
            if (!nextQ) {
                alert("Failed to load next question. Ending test.");
                endTest("Failed to load aptitude question.");
                return;
            }
            testState.aptitude.currentQuestion = nextQ;
            testState.aptitude.nextQuestion = null;
             if (testState.aptitude.currentIndex < 19) {
                testState.aptitude.nextQuestionPromise = fetchNextAptitudeQuestion();
                testState.aptitude.nextQuestionPromise.then(q => { testState.aptitude.nextQuestion = q; });
            }
            displayAptitudeQuestion(testState.aptitude.currentQuestion);
        }
    }
    function endAptitudeRound() {
        clearInterval(testState.masterTimerInterval); 
        if (testState.allRoundResults.aptitude.length < 20) {
            const { currentQuestion, currentIndex, selectedAnswer } = testState.aptitude;
            if (currentQuestion && testState.allRoundResults.aptitude.length === currentIndex) {
                 testState.allRoundResults.aptitude.push({
                    question: currentQuestion.question,
                    user_answer: selectedAnswer, 
                    correct_answer: currentQuestion.correct_answer,
                    is_correct: selectedAnswer === currentQuestion.correct_answer
                });
            }
        }
        console.log("Aptitude Round Finished. Results:", testState.allRoundResults.aptitude);
        showCommunicationInstructions();
    }
    async function startAptitudeRound() {
        testState.currentRound = 1;
        roundName.innerText = "Aptitude Test";
        loadAptitudeUI();
        const { ui } = testState.aptitude;
        testState.aptitude.nextQuestionPromise = fetchNextAptitudeQuestion();
        testState.aptitude.currentQuestion = await testState.aptitude.nextQuestionPromise;
        if (!testState.aptitude.currentQuestion) {
             ui.loadingText.innerHTML = `⚠️ Error fetching first question.<br/>Please reload and try again.`;
             return;
        }
        ui.loadingSpinner.style.display = "none";
        ui.content.style.display = "block";
        testState.aptitude.currentIndex = 0;
        displayAptitudeQuestion(testState.aptitude.currentQuestion);
        testState.aptitude.nextQuestionPromise = fetchNextAptitudeQuestion();
        testState.aptitude.nextQuestionPromise.then(q => { testState.aptitude.nextQuestion = q; });
        startMasterTimer(30, endAptitudeRound); 
    }

    // --- Round 2: Communication (Complete) ---
    function showCommunicationInstructions() {
        testState.currentRound = 1.5; 
        roundName.innerText = "Next Round: Communication";
        masterTimerEl.innerText = "--:--"; 
        roundContent.innerHTML = `
            <div class="container" style="max-width: 900px; box-shadow: none; padding-top: 0; text-align: left;">
                <h1 style="text-align: center;">Round 2: Communication Assessment</h1>
                <p>This round tests your verbal communication skills.</p>
                <ul>
                    <li>You will be given one random topic.</li>
                    <li>You will have <strong>15 seconds</strong> to prepare.</li>
                    <li>Your camera and microphone will turn on.</li>
                    <li>You will then have <strong>60 seconds</strong> to speak on the topic.</li>
                    <li>Your pace, filler words, and facial expressions will be analyzed.</li>
                </ul>
                <p>You can click "Stop Recording" if you finish early. The round has a total time limit of 2 minutes.</p>
                <div class="nav-button-row" style="margin-top: 30px;">
                    <button id="start-comm-btn" class="tool-button-primary">Start Communication Round</button>
                </div>
            </div>`;
        document.getElementById("start-comm-btn").addEventListener("click", startCommunicationRound);
    }
    function loadCommunicationUI() {
        roundContent.innerHTML = `
            <div class="container" style="max-width: 900px; box-shadow: none; padding-top: 0;">
                <h2 id="comm-status-text">Prepare...</h2>
                <div class="stats-bar" style="justify-content: center;">
                    <div id="comm-timer-text" style="font-size: 1.5rem;">Time Left: 15s</div>
                </div>
                <div class="question-box" id="comm-topic-box">
                    Fetching topic...
                </div>
                <div class="video-container" id="comm-video-container" style="display: none; background: #000; border-radius: 8px; margin: 15px auto; max-width: 400px;">
                    <video id="comm-user-video" width="400" height="300" autoplay muted style="transform: scaleX(-1);"></video>
                </div>
                <div class="audio-controls" id="comm-audio-controls" style="display: none; justify-content: center; align-items: center; gap: 10px; margin-bottom: 15px;">
                    <button id="comm-stop-btn" class="tool-button-danger" style="width: auto;">⏹️ Stop Recording</button>
                    <span id="comm-record-status" style="font-weight: bold; color: #d90429;">Recording...</span>
                </div>
                <div class="nav-button-row" id="comm-submit-row" style="display: none; margin-top: 20px;">
                    <button id="comm-submit-btn" class="tool-button-primary" disabled>Submit Answer</button>
                </div>
                <div id="comm-spinner" class="spinner-overlay" style="display: none; position: relative; background: rgba(255,255,255,0.8); border-radius: 8px; min-height: 200px;">
                    <div class="spinner"></div>
                    <p id="comm-spinner-text">Submitting...</p>
                </div>
            </div>`;
        testState.communication.ui = {
            statusText: document.getElementById("comm-status-text"),
            timerText: document.getElementById("comm-timer-text"),
            topicBox: document.getElementById("comm-topic-box"),
            videoContainer: document.getElementById("comm-video-container"),
            userVideo: document.getElementById("comm-user-video"),
            spinner: document.getElementById("comm-spinner"),
            spinnerText: document.getElementById("comm-spinner-text"),
            audioControls: document.getElementById("comm-audio-controls"),
            stopBtn: document.getElementById("comm-stop-btn"),
            recordStatus: document.getElementById("comm-record-status"),
            submitRow: document.getElementById("comm-submit-row"),
            submitBtn: document.getElementById("comm-submit-btn")
        };
        testState.communication.ui.stopBtn.addEventListener("click", stopCommunicationRecording);
        testState.communication.ui.submitBtn.addEventListener("click", submitCommunicationAnswer);
    }
    async function startCommunicationRound() {
        testState.currentRound = 2;
        roundName.innerText = "Communication Test";
        loadCommunicationUI();
        testState.communication.isSubmitting = false;
        try {
            const response = await fetch("https://prepmateai-project-production.up.railway.app/communication-topic");
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            testState.communication.currentTopic = data.topic;
            testState.communication.ui.topicBox.innerText = data.topic;
            startCommunicationTimer(15, "Prepare...", () => {
                startCommunicationRecording();
            });
        } catch (error) {
            testState.communication.ui.topicBox.innerHTML = `⚠️ Error fetching topic: ${error.message}.<br/>Advancing to next round.`;
            setTimeout(showCodingInstructions, 3000); 
        }
        startMasterTimer(2, endCommunicationRound);
    }
    function startCommunicationTimer(duration, statusText, onTimeUp) {
        clearInterval(testState.communication.roundTimerInterval);
        const { ui } = testState.communication;
        let secondsLeft = duration;
        const update = () => {
            if (ui.statusText) { 
                ui.statusText.innerText = statusText;
                ui.timerText.innerText = `Time Left: ${secondsLeft}s`;
            }
            if (secondsLeft <= 0) {
                clearInterval(testState.communication.roundTimerInterval);
                onTimeUp();
            }
            secondsLeft--;
        };
        update();
        testState.communication.roundTimerInterval = setInterval(update, 1000);
    }
    async function startCommunicationRecording() {
        const { ui } = testState.communication;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            testState.communication.localStream = stream;
            ui.videoContainer.style.display = "block";
            ui.userVideo.srcObject = stream;
            ui.userVideo.play();
            ui.audioControls.style.display = "flex";
            ui.stopBtn.disabled = false;
            ui.submitRow.style.display = "flex";
            ui.submitBtn.disabled = true;
            testState.communication.mediaRecorder = new MediaRecorder(stream);
            testState.communication.audioChunks = [];
            testState.communication.expressionData = [];
            testState.communication.mediaRecorder.ondataavailable = (event) => {
                testState.communication.audioChunks.push(event.data);
            };
            testState.communication.mediaRecorder.onstop = () => {
                testState.communication.recordedAudioBlob = new Blob(
                    testState.communication.audioChunks, { type: "audio/webm" }
                );
            };
            testState.communication.mediaRecorder.start();
            testState.communication.faceDetectionInterval = setInterval(async () => {
                if (ui.userVideo.paused || ui.userVideo.ended) return;
                const detections = await faceapi.detectSingleFace(ui.userVideo, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();
                if (detections && detections.expressions) {
                    let mainExpression = Object.keys(detections.expressions).reduce((a, b) => 
                        detections.expressions[a] > detections.expressions[b] ? a : b
                    );
                    testState.communication.expressionData.push(mainExpression);
                }
            }, 1000);
            startCommunicationTimer(60, "Recording...", () => {
                stopCommunicationRecording();
            });
        } catch (error) {
            ui.topicBox.innerHTML = `⚠️ Mic/Cam permission denied. Cannot proceed with round.<br/>Advancing to next round.`;
            console.error("Error accessing media devices:", error);
            setTimeout(showCodingInstructions, 3000);
        }
    }
    function stopCommunicationRecording() {
        if (testState.communication.mediaRecorder && testState.communication.mediaRecorder.state === "recording") {
            testState.communication.mediaRecorder.stop();
        }
        clearInterval(testState.communication.faceDetectionInterval);
        clearInterval(testState.communication.roundTimerInterval);
        if (testState.communication.localStream) {
            testState.communication.localStream.getTracks().forEach(track => track.stop());
            testState.communication.localStream = null;
        }
        const { ui } = testState.communication;
        if(ui.videoContainer) { 
            ui.videoContainer.style.display = "none";
            ui.stopBtn.disabled = true;
            ui.submitBtn.disabled = false;
            ui.statusText.innerText = "Recording Finished";
            ui.timerText.innerText = "Time Left: 0s";
            ui.recordStatus.innerText = "Press Submit to continue.";
        }
    }
    async function submitCommunicationAnswer() {
        if (testState.communication.isSubmitting) return; 
        testState.communication.isSubmitting = true;
        clearInterval(testState.masterTimerInterval);
        clearInterval(testState.communication.roundTimerInterval);
        stopCommunicationRecording();
        const { ui, recordedAudioBlob, currentTopic, expressionData } = testState.communication;
        if (!recordedAudioBlob || recordedAudioBlob.size === 0) {
            console.log("No audio recorded, skipping submission.");
            testState.allRoundResults.communication = "No audio recorded.";
            showCodingInstructions(); 
            return;
        }
        if (ui.statusText) { 
            ui.statusText.innerText = "Submitting...";
            ui.topicBox.style.display = "none";
            ui.audioControls.style.display = "none";
            ui.submitRow.style.display = "none";
            ui.spinner.style.display = "flex";
        }
        const formData = new FormData();
        formData.append("audio_file", recordedAudioBlob, "answer.webm");
        formData.append("question", currentTopic); 
        formData.append("expressions", JSON.stringify(expressionData));
        try {
            const response = await fetch("https://prepmateai-project-production.up.railway.app/communication-feedback", {
                method: "POST",
                body: formData, 
            });
            const data = await response.json();
            testState.allRoundResults.communication = data.error ? `Error: ${data.error}` : data.feedback;
        } catch (error) {
            testState.allRoundResults.communication = "Error: Server not responding.";
            console.error("Communication submit error:", error);
        }
        console.log("Communication Round Finished. Result:", testState.allRoundResults.communication);
        showCodingInstructions();
    }
    function endCommunicationRound() {
        submitCommunicationAnswer();
    }
    
    // --- Round 3: Coding (FIXED) ---
    function showCodingInstructions() {
        testState.currentRound = 2.5; 
        roundName.innerText = "Next Round: Coding";
        masterTimerEl.innerText = "--:--";
        roundContent.innerHTML = `
            <div class="container" style="max-width: 900px; box-shadow: none; padding-top: 0; text-align: left;">
                <h1 style="text-align: center;">Round 3: Coding Test</h1>
                <p>This round tests your problem-solving and coding skills in <strong>${testState.codingLanguage}</strong>.</p>
                <ul>
                    <li>You will be given <strong>2 coding problems</strong> to solve.</li>
                    <li>You can run your code against test cases.</li>
                    <li>Your submission will be recorded when all test cases pass.</li>
                    <li>This round has a total time limit of <strong>45 minutes</strong>.</li>
                </ul>
                <div class="nav-button-row" style="margin-top: 30px;">
                    <button id="start-coding-btn" class="tool-button-primary">Start Coding Round</button>
                    <button id="skip-coding-btn" class="tool-button-danger">Temp: Skip to Next Round</button>
                </div>
            </div>`;
        document.getElementById("start-coding-btn").addEventListener("click", () => {
            loadCodingUI(); 
            require(["vs/editor/editor.main"], () => {
                console.log("Monaco Editor has been loaded.");
                startCodingRound(); 
            });
        });
        document.getElementById("skip-coding-btn").addEventListener("click", endCodingRound); 
    }
    function loadCodingUI() {
        roundContent.innerHTML = `
            <div class="container" style="max-width: 1200px; box-shadow: none; padding-top: 0;">
                <div id="coding-loading" class="spinner-overlay" style="display: flex; position: relative; background: rgba(255,255,255,0.8); border-radius: 8px; min-height: 400px;">
                    <div class="spinner"></div>
                    <p id="coding-loading-text">Loading Code Editor...</p>
                </div>
                <div id="coding-running" class="spinner-overlay" style="display: none; position: relative; background: rgba(255,255,255,0.8); border-radius: 8px; min-height: 400px;">
                    <div class="spinner"></div>
                    <p>Compiling & Running Code...</p>
                </div>
                <div id="coding-content" style="display: none;">
                    <h2 id="coding-question-counter" style="text-align: left; margin-top: 0;">Problem 1 of 2</h2>
                    <div class="question-box" id="coding-question-text"></div>
                    <div class="run-code-row">
                        <label class="editor-label" id="coding-editor-label">Your Code:</label>
                        <button id="coding-run-btn" class="tool-button-solution">Run Code</button>
                    </div>
                    <div id="coding-editor-container" style="width: 100%; height: 350px; border: 1px solid #ddd; border-radius: 8px;"></div>
                    <label class="editor-label" style="margin-top: 15px;">Output:</label>
                    <div id="coding-output-box" class="solution-box" style="min-height: 100px;">
                        Click "Run Code" to see your test case results...
                    </div>
                </div>
            </div>`;
        testState.coding.ui = {
            loadingSpinner: document.getElementById("coding-loading"),
            loadingText: document.getElementById("coding-loading-text"),
            runningSpinner: document.getElementById("coding-running"),
            content: document.getElementById("coding-content"),
            counter: document.getElementById("coding-question-counter"),
            questionText: document.getElementById("coding-question-text"),
            editorLabel: document.getElementById("coding-editor-label"),
            editorContainer: document.getElementById("coding-editor-container"),
            outputBox: document.getElementById("coding-output-box"),
            runBtn: document.getElementById("coding-run-btn"),
        };
        testState.coding.ui.runBtn.addEventListener("click", handleCodingActionClick);
    }
    async function fetchCodingQuestion(topic) {
        if (testState.coding.isFetching) return null;
        testState.coding.isFetching = true;
        try {
            const response = await fetch("https://prepmateai-project-production.up.railway.app/technical-question", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    topic: topic,
                    language: testState.codingLanguage
                }),
            });
            const data = await response.json();
            testState.coding.isFetching = false;
            if (data.error) {
                alert(`Error: ${data.error}. Please try again.`);
                return null;
            }
            return data;
        } catch (error) {
            testState.coding.isFetching = false;
            alert("⚠️ Server not responding. Make sure backend is running.");
            return null;
        }
    }
    function displayCodingQuestion(data) {
        const { ui } = testState.coding;
        const index = testState.coding.currentIndex;
        ui.counter.innerText = `Problem ${index + 1} of 2`;
        ui.questionText.innerHTML = `<strong>${data.question_title}</strong><br>${data.problem_statement.replace(/\\n/g, '<br>')}`;
        ui.editorLabel.innerText = `Your Code (${testState.codingLanguage === 'java' ? 'Java' : 'Python 3'}):`;
        testState.coding.editor.setValue(data.starter_code || "");
        testState.coding.editor.updateOptions({ readOnly: false }); 
        ui.outputBox.innerHTML = "Click 'Run Code' to see your test case results...";
        ui.runBtn.innerText = "Run Code";
        ui.runBtn.disabled = false;
        ui.runBtn.classList.remove("tool-button-primary");
        ui.runBtn.classList.add("tool-button-solution");
    }
    async function loadCodingQuestion(index) {
        const { ui } = testState.coding;
        const topic = (index === 0) ? "Basic" : "Mix (DSA)";
        ui.content.style.display = "none";
        ui.loadingSpinner.style.display = "flex";
        ui.loadingText.innerText = `Loading problem ${index + 1} of 2... (${topic})`;
        testState.coding.currentQuestionData = await fetchCodingQuestion(topic);
        ui.loadingSpinner.style.display = "none";
        ui.content.style.display = "block";
        if (!testState.coding.currentQuestionData) {
            alert("Failed to load coding question. Advancing to next round.");
            endCodingRound();
            return;
        }
        displayCodingQuestion(testState.coding.currentQuestionData);
        if (index === 0) {
            testState.coding.nextQuestionPromise = fetchCodingQuestion("Mix (DSA)");
            testState.coding.nextQuestionPromise.then(q => { testState.coding.nextQuestion = q; });
        }
    }
    
    // ⭐️ --- THIS IS THE FIXED FUNCTION --- ⭐️
    async function handleCodingActionClick() {
        const { ui, currentIndex, nextQuestion, nextQuestionPromise } = testState.coding;
        const buttonText = ui.runBtn.innerText;
        const userCode = testState.coding.editor.getValue(); // Get code *before* checking button

        if (buttonText === "Run Code") {
            if (testState.coding.isRunning) return;
            testState.coding.isRunning = true;
            ui.runningSpinner.style.display = "flex";
            ui.runBtn.disabled = true;
            ui.outputBox.innerHTML = "Compiling & Running...";

            try {
                const response = await fetch("https://prepmateai-project-production.up.railway.app/run-code", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        user_code: userCode,
                        language: testState.codingLanguage,
                        test_cases: testState.coding.currentQuestionData.test_cases
                    }),
                });
                
                const data = await response.json();
                ui.outputBox.innerHTML = ""; 
                
                if (data.error) {
                    ui.outputBox.innerHTML = `<span class="error">Error: ${data.error}</span>`;
                } else if (data.results) {
                    let all_passed = true;
                    data.results.forEach(result => {
                        if (result.includes("PASSED")) {
                            ui.outputBox.innerHTML += `<span class="pass">${result}</span>\n`;
                        } else {
                            ui.outputBox.innerHTML += `<span class="fail">${result}</span>\n`;
                            all_passed = false;
                        }
                    });

                    // --- ⭐️ START FIX ⭐️ ---
                    
                    if (all_passed) {
                        ui.outputBox.innerHTML += `\n<strong class="pass">All test cases passed!</strong>`;
                        testState.allRoundResults.coding.push({
                            question: testState.coding.currentQuestionData.question_title,
                            user_code: userCode,
                            status: "Passed"
                        });
                    } else {
                        ui.outputBox.innerHTML += `\n<strong class="fail">Some test cases failed. Your attempt has been recorded.</strong>`;
                        testState.allRoundResults.coding.push({
                            question: testState.coding.currentQuestionData.question_title,
                            user_code: userCode,
                            status: "Failed"
                        });
                    }

                    // This block now runs REGARDLESS of pass/fail
                    testState.coding.editor.updateOptions({ readOnly: true }); 
                    ui.runBtn.disabled = false;
                    ui.runBtn.innerText = (currentIndex === 0) ? "Next Question" : "Finish Round";
                    ui.runBtn.classList.remove("tool-button-solution");
                    ui.runBtn.classList.add("tool-button-primary");
                    
                    // --- ⭐️ END FIX ⭐️ ---
                }
            } catch (error) {
                ui.outputBox.innerHTML = `<span class="error">⚠️ Server not responding.</span>`;
            }
            
            ui.runningSpinner.style.display = "none";
            
            // Re-enable button ONLY if it's still "Run Code" (e.g., after a server error)
            if(ui.runBtn.innerText === "Run Code") {
                 ui.runBtn.disabled = false;
            }
            testState.coding.isRunning = false;

        } else if (buttonText === "Next Question") {
            // This logic is unchanged
            testState.coding.currentIndex = 1;
            if (nextQuestion) {
                testState.coding.currentQuestionData = nextQuestion;
                testState.coding.nextQuestion = null;
                displayCodingQuestion(testState.coding.currentQuestionData);
            } else {
                ui.content.style.display = "none";
                ui.loadingSpinner.style.display = "flex";
                ui.loadingText.innerText = "Loading problem 2 of 2...";
                const nextQ = await nextQuestionPromise;
                ui.loadingSpinner.style.display = "none";
                ui.content.style.display = "block";
                if (!nextQ) {
                    alert("Failed to load next question. Ending round.");
                    endCodingRound();
                    return;
                }
                testState.coding.currentQuestionData = nextQ;
                displayCodingQuestion(testState.coding.currentQuestionData);
            }
        } else if (buttonText === "Finish Round") {
            endCodingRound();
        }
    }
    
    function endCodingRound() {
        clearInterval(testState.masterTimerInterval);
        
        // Save incomplete work if round ends prematurely
        if (testState.allRoundResults.coding.length < testState.coding.currentIndex + 1) {
             const currentCode = testState.coding.editor ? testState.coding.editor.getValue() : "";
             if (testState.coding.currentQuestionData) { 
                testState.allRoundResults.coding.push({
                    question: testState.coding.currentQuestionData.question_title,
                    user_code: currentCode,
                    status: "Incomplete"
                });
             }
        }
        
        if (testState.coding.editor) {
            testState.coding.editor.dispose();
            testState.coding.editor = null;
        }
        console.log("Coding Round Finished. Results:", testState.allRoundResults.coding);
        showInterviewInstructions();
    }
    
    async function startCodingRound() {
        testState.currentRound = 3;
        roundName.innerText = `Coding Test (${testState.codingLanguage})`;
        testState.coding.editor = monaco.editor.create(testState.coding.ui.editorContainer, {
            value: "# Loading problem...",
            language: testState.codingLanguage,
            theme: "vs-dark",
            automaticLayout: true,
            readOnly: true
        });
        testState.coding.currentIndex = 0;
        await loadCodingQuestion(0);
        startMasterTimer(45, endCodingRound);
    }

    // --- Round 4: Interview (Complete) ---
    
    function showInterviewInstructions() {
        testState.currentRound = 3.5; 
        roundName.innerText = "Next Round: Live Interview";
        masterTimerEl.innerText = "--:--";
        let resumeText = testState.resumeText 
            ? "This interview will include questions based on the resume you uploaded." 
            : "Since you skipped the resume upload, you will be asked general HR and Managerial questions.";
        roundContent.innerHTML = `
            <div class="container" style="max-width: 900px; box-shadow: none; padding-top: 0; text-align: left;">
                <h1 style="text-align: center;">Round 4: Live AI Interview</h1>
                <p>This is the final round. You will have a live conversation with the AI hiring manager.</p>
                <ul>
                    <li>This will be a <strong>6-question interview</strong>.</li>
                    <li>The AI will ask a question, and you will record your answer.</li>
                    <li>${resumeText}</li>
                    <li>Your answers, facial expressions, and tone will be analyzed.</li>
                </ul>
                <div class="nav-button-row" style="margin-top: 30px;">
                    <button id="start-interview-btn" class="tool-button-primary">Start Interview</button>
                    <button id="skip-interview-btn" class="tool-button-danger">Temp: Skip to End</button>
                </div>
            </div>`;
        document.getElementById("start-interview-btn").addEventListener("click", startInterviewRound);
        document.getElementById("skip-interview-btn").addEventListener("click", () => endTest("Test skipped."));
    }
    
    function loadInterviewUI() {
        roundContent.innerHTML = `
            <div class="container" style="max-width: 900px; box-shadow: none; padding-top: 0;">
                <div id="chat-container"></div>
                <div id="typing-indicator" class="hidden">
                    <div class="chat-bubble ai">
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                    </div>
                </div>
                <div class="video-container" id="interview-video-container" style="display: none;">
                    <video id="interview-user-video" width="400" height="300" autoplay muted></video>
                </div>
                <div class="voice-controls">
                    <button id="interview-mute-btn" class="tool-button-secondary">🔇 Mute Voice</button>
                </div>
                <div class="audio-controls">
                    <button id="interview-record-btn" disabled>🎙️ Record Answer</button>
                    <button id="interview-stop-btn" disabled>⏹️ Stop Recording</button>
                    <span id="interview-record-status"></span>
                </div>
            </div>`;
        
        testState.interview.ui = {
            chatContainer: document.getElementById("chat-container"),
            typingIndicator: document.getElementById("typing-indicator"),
            videoContainer: document.getElementById("interview-video-container"),
            userVideo: document.getElementById("interview-user-video"),
            muteBtn: document.getElementById("interview-mute-btn"),
            recordBtn: document.getElementById("interview-record-btn"),
            stopBtn: document.getElementById("interview-stop-btn"),
            recordStatus: document.getElementById("interview-record-status"),
        };

        testState.interview.ui.recordBtn.addEventListener("click", startInterviewRecording);
        testState.interview.ui.stopBtn.addEventListener("click", stopInterviewRecording);
        testState.interview.ui.muteBtn.addEventListener("click", toggleInterviewMute);
    }
    
    function startInterviewRound() {
        testState.currentRound = 4;
        roundName.innerText = "Live Interview";
        loadInterviewUI();
        
        testState.interview.conversationHistory = [];
        testState.interview.questionNumber = 0;
        testState.interview.isSubmitting = false;
        
        sendInterviewAnswer(null, null); 
        startMasterTimer(20, endInterviewRound);
    }

    function addInterviewMessageToChat(role, text) {
        const { ui } = testState.interview;
        const bubble = document.createElement('div');
        bubble.classList.add('chat-bubble', role); 
        const roleStrong = document.createElement('strong');
        roleStrong.innerText = (role === 'ai') ? 'PrepAura' : 'You';
        const textNode = document.createElement('span');
        textNode.innerText = text;
        bubble.appendChild(roleStrong);
        bubble.appendChild(textNode);
        ui.chatContainer.appendChild(bubble);
        ui.chatContainer.scrollTop = ui.chatContainer.scrollHeight;
    }

    function showInterviewTyping(show) {
        testState.interview.ui.typingIndicator.classList.toggle('hidden', !show);
        if (show) {
            testState.interview.ui.chatContainer.scrollTop = testState.interview.ui.chatContainer.scrollHeight;
        }
    }
    
    function speakInterviewAnswer(text) {
        if (testState.interview.isMuted) return;
        window.speechSynthesis.cancel(); 
        const utterance = new SpeechSynthesisUtterance(text);
        let { speechVoices } = testState.interview;
        if (speechVoices.length === 0) loadVoices();
        let preferredVoice = speechVoices.find(voice => 
            (voice.lang === 'en-US' || voice.lang === 'en-GB') && 
            (voice.name.includes('Google') || voice.name.includes('Natural'))
        );
        utterance.voice = preferredVoice || speechVoices.find(voice => voice.lang === 'en-US');
        utterance.onerror = () => console.error("Speech synthesis error.");
        window.speechSynthesis.speak(utterance);
    }
    
    function toggleInterviewMute() {
        const { ui } = testState.interview;
        testState.interview.isMuted = !testState.interview.isMuted;
        if (testState.interview.isMuted) {
            window.speechSynthesis.cancel();
            ui.muteBtn.innerText = "🔊 Unmute Voice";
            ui.muteBtn.classList.remove("tool-button-secondary");
            ui.muteBtn.classList.add("tool-button-primary");
        } else {
            ui.muteBtn.innerText = "🔇 Mute Voice";
            ui.muteBtn.classList.add("tool-button-secondary");
            ui.muteBtn.classList.remove("tool-button-primary");
            const lastMessage = testState.interview.conversationHistory[testState.interview.conversationHistory.length - 1];
            if (lastMessage && lastMessage.role === 'ai') {
                speakInterviewAnswer(lastMessage.content);
            }
        }
    }
    
    async function startInterviewRecording() {
        window.speechSynthesis.cancel(); 
        const { ui } = testState.interview;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            testState.interview.localStream = stream;
            ui.videoContainer.style.display = "block";
            ui.userVideo.srcObject = stream;
            ui.userVideo.play(); 
            
            testState.interview.mediaRecorder = new MediaRecorder(stream);
            testState.interview.audioChunks = [];
            testState.interview.expressionData = [];

            testState.interview.mediaRecorder.onstart = () => {
                ui.recordStatus.innerText = "Recording...";
                ui.recordBtn.disabled = true;
                ui.stopBtn.disabled = false;
                
                testState.interview.faceDetectionInterval = setInterval(async () => {
                    if (ui.userVideo.paused || ui.userVideo.ended) return;
                    const detections = await faceapi.detectSingleFace(ui.userVideo, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();
                    if (detections && detections.expressions) {
                        let mainExpression = Object.keys(detections.expressions).reduce((a, b) => 
                            detections.expressions[a] > detections.expressions[b] ? a : b
                        );
                        testState.interview.expressionData.push(mainExpression);
                    }
                }, 1000);
            };

            testState.interview.mediaRecorder.ondataavailable = (event) => {
                testState.interview.audioChunks.push(event.data);
            };

            testState.interview.mediaRecorder.onstop = () => {
                clearInterval(testState.interview.faceDetectionInterval); 
                if (testState.interview.localStream) {
                    testState.interview.localStream.getTracks().forEach(track => track.stop());
                }
                ui.videoContainer.style.display = "none";
                ui.userVideo.srcObject = null;
                testState.interview.recordedAudioBlob = new Blob(testState.interview.audioChunks, { type: "audio/webm" });
                ui.recordStatus.innerText = "Recording stopped. Submitting...";
                ui.recordBtn.disabled = true; 
                ui.stopBtn.disabled = true;
                sendInterviewAnswer(testState.interview.recordedAudioBlob, JSON.stringify(testState.interview.expressionData));
            };
            testState.interview.mediaRecorder.start();
        } catch (error) {
            ui.recordStatus.innerText = "⚠️ Mic/Cam permission denied.";
            console.error("Error accessing media devices:", error);
        }
    }
    
    function stopInterviewRecording() {
        if (testState.interview.mediaRecorder && testState.interview.mediaRecorder.state === "recording") {
            testState.interview.mediaRecorder.stop();
        }
        clearInterval(testState.interview.faceDetectionInterval);
        if (testState.interview.localStream) {
            testState.interview.localStream.getTracks().forEach(track => track.stop());
            testState.interview.localStream = null;
        }
    }

    async function sendInterviewAnswer(audioBlob, expressionsJSON) {
        if (testState.interview.isSubmitting) return;
        testState.interview.isSubmitting = true;

        showInterviewTyping(true);
        const { ui } = testState.interview;
        ui.recordStatus.innerText = "PrepAura is analyzing...";

        testState.interview.questionNumber++;
        const qNum = testState.interview.questionNumber;
        let endpoint = "";
        let customPrompt = "";

        if (qNum === 1) {
            endpoint = "/hr-conversation";
            customPrompt = "Start the interview with 'Tell me about yourself.'";
        } else if (qNum === 2) {
            endpoint = testState.resumeText ? "/resume-conversation" : "/hr-conversation";
            customPrompt = testState.resumeText ? "Ask a specific question about my resume." : "Ask me about my greatest strength or weakness.";
        } else if (qNum === 3) {
            endpoint = testState.resumeText ? "/resume-conversation" : "/hr-conversation";
            customPrompt = testState.resumeText ? "Ask a follow-up question based on my last answer about my resume." : "Ask me a follow-up about my last answer.";
        } else if (qNum === 4) {
            endpoint = "/managerial-conversation";
            customPrompt = "Ask me a common managerial or behavioral question (e.g., conflict, teamwork, leadership).";
        } else if (qNum === 5) {
            endpoint = "/managerial-conversation";
            customPrompt = "Ask me a follow-up question based on my last answer.";
        } else if (qNum === 6) {
            endpoint = "/hr-conversation";
            customPrompt = "Ask me if I have any questions for you, then say 'This concludes our interview.'";
        }

        const formData = new FormData();
        if (endpoint === "/resume-conversation") {
            formData.append("resume_text", testState.resumeText);
        }
        
        let historyForBackend = [...testState.interview.conversationHistory];
        if (customPrompt) {
            historyForBackend.push({ role: "system", content: customPrompt });
        }
        
        formData.append("conversation_history", JSON.stringify(historyForBackend));
        
        if (audioBlob) {
            formData.append("audio_file", audioBlob, "my_answer.webm");
            formData.append("expressions", expressionsJSON);
        }

        try {
            const response = await fetch(`https://prepmateai-project-production.up.railway.app${endpoint}`, {
                method: "POST",
                body: formData, 
            });
            
            const data = await response.json();
            showInterviewTyping(false); 

            if (data.error) {
                addInterviewMessageToChat('ai', `⚠️ Error: ${data.error}`);
                return;
            }

            if (data.user_transcript) {
                addInterviewMessageToChat('user', data.user_transcript);
            }
            if (data.ai_response) {
                addInterviewMessageToChat('ai', data.ai_response);
                speakInterviewAnswer(data.ai_response); 
            }

            testState.interview.conversationHistory = data.updated_history;
            testState.allRoundResults.interview = data.updated_history; 

            if (qNum >= 6 || data.session_complete) {
                endInterviewRound();
            } else {
                ui.recordBtn.disabled = false; 
                ui.recordStatus.innerText = "Press 'Record Answer'";
            }
            
        } catch (error) {
            showInterviewTyping(false);
            addInterviewMessageToChat('ai', "⚠️ Server not responding. Make sure backend is running.");
            console.error("Fetch error:", error);
        }
        testState.interview.isSubmitting = false;
    }

    function endInterviewRound() {
        clearInterval(testState.masterTimerInterval);
        
        stopInterviewRecording();
        window.speechSynthesis.cancel();
        
        const finalChatHistory = testState.interview.conversationHistory;
        testState.allRoundResults.interview = finalChatHistory;
        
        console.log("Interview Round Finished. Results:", finalChatHistory);

        endTest("You have completed all rounds.");
    }
});