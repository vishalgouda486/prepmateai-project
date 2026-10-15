// ======================
// Communication.js — FIXED
// ======================

// This is a new function that will run all our code
function initializeApp() {
  
  // --- GET ALL HTML ELEMENTS ---
  const setupScreen = document.getElementById("setup-screen");
  const practiceScreen = document.getElementById("practice-screen");
  const feedbackScreen = document.getElementById("feedback-screen");
  const loadingSpinner = document.getElementById("loading-spinner");
  const spinnerTest = document.getElementById("spinner-text");

  const startBtn = document.getElementById("start-btn");
  const modelStatus = document.getElementById("model-status");
  
  const statusText = document.getElementById("status-text");
  const timerText = document.getElementById("timer-text");
  const topicBox = document.getElementById("topic-box");
  const videoContainer = document.getElementById("video-container");
  const userVideo = document.getElementById("user-video");
  const stopBtn = document.getElementById("stop-btn");
  const feedbackBtn = document.getElementById("feedback-btn");

  const feedbackReport = document.getElementById("feedback-report");
  const restartBtn = document.getElementById("restart-btn");

  // --- STATE VARIABLES ---
  let mediaRecorder;
  let audioChunks = [];
  let recordedAudioBlob; 
  let localStream; 
  let countdownInterval;
  let recordingTimeout;
  
  // --- FACE ANALYSIS VARIABLES ---
  let faceDetectionInterval;
  let expressionData = []; 

  // --- PRE-FETCHING STATE VARIABLES ---
  let currentTopicData = null;
  let nextTopicData = null; 
  let nextTopicPromise = null; 
  let isFetching = false;

  // --- Markdown → HTML Converter ---
  function convertMarkdownToProHTML(md) {
      if (!md) return "";

      // Handle headers (### or ##) with optional leading whitespace
      md = md.replace(/^\s*#{2,3}\s*(.*$)/gim, '<div class="ai-mini-heading">$1</div>');

      // Handle bullet points (starting with - or *)
      md = md.replace(/^\s*[-*]\s*(.*$)/gim, '<div class="ai-bullet">• $1</div>');

      // Handle Bold (**text**)
      md = md.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');

      // Handle New lines
      md = md.replace(/\n/g, '<br>');

      return md;
}


  // --- 1. LOAD AI MODELS ---
  async function loadFaceApiModels() {
    const MODEL_URL = '/models'; 
    try {
      modelStatus.innerText = "Loading AI Face Models (locally)...";
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
      ]);
      modelStatus.innerText = "✅ AI Models Loaded. Ready!";
      startBtn.disabled = false;
    } catch (error) {
      modelStatus.innerText = "❌ Error loading local AI models. Check the /models folder and refresh.";
      console.error("Error loading face-api models:", error);
    }
  }

  // --- 2. INITIALIZE ---
  loadFaceApiModels(); 

  // --- 3. CLICK LISTENERS ---
  startBtn.addEventListener("click", startChallenge);
  stopBtn.addEventListener("click", stopRecording);
  feedbackBtn.addEventListener("click", getFeedback); 
  restartBtn.addEventListener("click", restartPractice);


  // --- 4. FETCH TOPIC FUNCTION ---
  async function fetchTopic() {
      if (isFetching) return null; 
      isFetching = true;
      
      try {
          const response = await fetch("https://prepmateai-project-production.up.railway.app/communication-topic");
          const data = await response.json();
          isFetching = false;
          
          if (data.error) {
              alert(`Error: ${data.error}. Please try again.`);
              return null;
          }
          return data; 
          
      } catch (error) {
          isFetching = false;
          alert("⚠️ Server not responding. Make sure backend is running.");
          return null;
      }
  }

  // --- 5. START CHALLENGE ---
  async function startChallenge() {
    setupScreen.classList.add("hidden");
    practiceScreen.classList.remove("hidden");
    feedbackScreen.classList.add("hidden");
    
    spinnerTest.innerText = "Cooking up a topic...";
    loadingSpinner.style.display = "flex";

    currentTopicData = await fetchTopic();
    if (!currentTopicData) {
        loadingSpinner.style.display = "none";
        restartPractice();
        return;
    }

    nextTopicPromise = fetchTopic();
    nextTopicPromise.then(data => { nextTopicData = data });

    loadingSpinner.style.display = "none";
    displayTopicAndStartTimer(currentTopicData);
  }

  // --- 6. Show Topic + 15s Prep Timer ---
  function displayTopicAndStartTimer(topicData) {
    feedbackBtn.disabled = true;
    stopBtn.disabled = true;
    
    currentTopicData = topicData;
    topicBox.innerText = currentTopicData.topic;
    
    statusText.innerText = "Prepare...";
    let prepTime = 15;
    timerText.innerText = `Time Left: ${prepTime}s`;
    
    countdownInterval = setInterval(() => {
        prepTime--;
        timerText.innerText = `Time Left: ${prepTime}s`;
        if (prepTime <= 0) {
            clearInterval(countdownInterval);

            // ✅ Delay to ensure DOM ready
            setTimeout(startRecording, 300);
        }
    }, 1000);
  }


  // --- 7. START RECORDING — FIXED ---
  async function startRecording() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      if (videoContainer) videoContainer.style.display = "block";
      userVideo.srcObject = localStream;
      userVideo.play(); 
      
      mediaRecorder = new MediaRecorder(localStream);
      audioChunks = [];

      mediaRecorder.onstart = () => {
        if (stopBtn) stopBtn.disabled = false;
        if (feedbackBtn) feedbackBtn.disabled = true;
        
        statusText.innerText = "Recording...";
        let recordTime = 60;
        timerText.innerText = `Time Left: ${recordTime}s`;
        
        countdownInterval = setInterval(() => {
            recordTime--;
            timerText.innerText = `Time Left: ${recordTime}s`;
        }, 1000);

        recordingTimeout = setTimeout(stopRecording, 60000);
        
        expressionData = []; 
        faceDetectionInterval = setInterval(async () => {
          if (!userVideo.srcObject) return;
          
          const detections = await faceapi.detectSingleFace(userVideo, new faceapi.TinyFaceDetectorOptions())
                                        .withFaceExpressions();
          
          if (detections && detections.expressions) {
            let mainExpression = Object.keys(detections.expressions)
              .reduce((a, b) => detections.expressions[a] > detections.expressions[b] ? a : b);
            expressionData.push(mainExpression);
          }
        }, 1000);
      };

      mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);

      mediaRecorder.onstop = () => {
        clearInterval(countdownInterval);
        clearInterval(faceDetectionInterval);
        clearTimeout(recordingTimeout); 

        localStream.getTracks().forEach(track => track.stop());
        if (videoContainer) videoContainer.style.display = "none";
        userVideo.srcObject = null;
        
        recordedAudioBlob = new Blob(audioChunks, { type: "audio/webm" });
        
        statusText.innerText = "Recording Complete!";
        timerText.innerText = "Time Left: 0s";
        if (stopBtn) stopBtn.disabled = true;
        if (feedbackBtn) feedbackBtn.disabled = false;
      };

      mediaRecorder.start();

    } catch (error) {
      statusText.innerText = "⚠️ Device access failed — check camera/mic OR browser blocked auto-start.";
      console.log("Media access error:", error);
    }
  }

  // --- 8. STOP RECORDING ---
  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }

// --- 9. GET FEEDBACK (UPDATED WITH SECTION SPLITTING) ---
  async function getFeedback() {
    if (!recordedAudioBlob) {
      alert("No audio was recorded.");
      return;
    }

    spinnerTest.innerText = "Analyzing your performance...";
    loadingSpinner.style.display = "flex";
    practiceScreen.classList.add("hidden");
    feedbackScreen.classList.remove("hidden");

    const formData = new FormData();
    formData.append("audio_file", recordedAudioBlob, "answer.webm");
    formData.append("question", currentTopicData.topic);
    formData.append("expressions", JSON.stringify(expressionData));

    try {
      const response = await fetch(
        "https://prepmateai-project-production.up.railway.app/communication-feedback",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();
      const fb = data.feedback || "";

      if (data.error) {
        document.getElementById("ai-summary").innerHTML = `<div class="ai-content">⚠️ ${data.error}</div>`;
        loadingSpinner.style.display = "none";
        return;
      }

      // 1. Robust Case-Insensitive Regex Splitting (Matches the backend headers)
      const summaryMatch = fb.match(/###\s*Overall Summary([\s\S]*?)(?=###|$)/i);
      const deliveryMatch = fb.match(/###\s*Delivery and Pace([\s\S]*?)(?=###|$)/i);
      const expressionMatch = fb.match(/###\s*Expression Analysis([\s\S]*?)(?=###|$)/i);
      const keyMatch = fb.match(/###\s*Key Takeaway([\s\S]*?)(?=###|$)/i);

      const conv = (txt) => {
        return convertMarkdownToProHTML(txt ? txt.trim() : "Analysis unavailable.");
      };

      // 2. ---------------- SCORE CALCULATION ----------------
      let score = 80;
      if (fb.toLowerCase().includes("slow")) score -= 10;
      if (fb.toLowerCase().includes("fast")) score -= 10;
      if (fb.toLowerCase().includes("filler")) score -= 10;
      document.getElementById("comm-score").innerText = score;

      // 3. ---------------- FILL UI CARDS ----------------
      // If summaryMatch fails, fallback to first 300 chars of full feedback
      document.getElementById("ai-summary").innerHTML = conv(summaryMatch ? summaryMatch[1] : fb.slice(0, 300));
      document.getElementById("ai-delivery").innerHTML = conv(deliveryMatch ? deliveryMatch[1] : "Pace analysis unavailable.");
      document.getElementById("ai-expression").innerHTML = conv(expressionMatch ? expressionMatch[1] : "Expression analysis unavailable.");
      document.getElementById("ai-key").innerHTML = conv(keyMatch ? keyMatch[1] : "Maintain steady eye contact and confidence.");

      // 4. ---------------- RING ANIMATION ----------------
      const circle = document.querySelector(".apt-score-progress");
      const r = 60;
      const c = 2 * Math.PI * r;
      circle.style.strokeDasharray = `${c} ${c}`;
      setTimeout(() => {
        circle.style.strokeDashoffset = c * (1 - score / 100);
      }, 300);

      // 5. ---------------- DOWNLOAD BUTTON ----------------
      document.getElementById("download-comm-report").addEventListener("click", async () => {
        const node = document.querySelector(".apt-report");
        if (window.html2canvas) {
          const canvas = await html2canvas(node);
          const link = document.createElement("a");
          link.download = `communication-report-${Date.now()}.png`;
          link.href = canvas.toDataURL("image/png");
          link.click();
        }
      });
    } catch (err) {
      document.getElementById("ai-summary").innerHTML = "⚠️ Could not connect to server.";
    }

    loadingSpinner.style.display = "none";
  }
  
  // --- 10. Restart with Prefetch ---
  async function restartPractice() {
    feedbackScreen.classList.add("hidden");
    practiceScreen.classList.remove("hidden");

    spinnerTest.innerText = "Cooking up a new topic...";
    loadingSpinner.style.display = "flex";

    if (nextTopicData) {
        currentTopicData = nextTopicData;
        nextTopicData = null; 
        
        loadingSpinner.style.display = "none";
        displayTopicAndStartTimer(currentTopicData);
        
        nextTopicPromise = fetchTopic();
        nextTopicPromise.then(data => { nextTopicData = data });
        
    } else {
        const data = await nextTopicPromise;
        loadingSpinner.style.display = "none";
        
        if (data) {
            currentTopicData = data;
            nextTopicData = null; 
            
            displayTopicAndStartTimer(currentTopicData);
            
            nextTopicPromise = fetchTopic();
            nextTopicPromise.then(data => { nextTopicData = data });
        } else {
            alert("Failed to fetch next topic.");
            practiceScreen.classList.add("hidden");
            setupScreen.classList.remove("hidden");
        }
    }
  }

} // END initializeApp


// --- POLLING FACE API LOADER ---
function waitForFaceApi() {
  if (typeof faceapi !== 'undefined') {
    initializeApp();
  } else {
    setTimeout(waitForFaceApi, 100);
  }
}
waitForFaceApi();
