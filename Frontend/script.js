// This is a new function that will run all our code
function initializeApp() {
  
  // --- GET ALL HTML ELEMENTS ---
  const feedbackButton = document.getElementById("feedback-button");
  const questionInput = document.getElementById("interview_question");
  const responseBox = document.getElementById("response");
  const generateButton = document.getElementById("generate-button");
  const topicSelect = document.getElementById("topic-select");
  const recordButton = document.getElementById("record-button");
  const stopButton = document.getElementById("stop-button");
  const recordStatus = document.getElementById("record-status");
  const audioPlayback = document.getElementById("audio-playback");
  const speechPlayButton = document.getElementById("speech-play-button");
  const modelStatus = document.getElementById("model-status");
  const videoContainer = document.getElementById("video-container");
  const userVideo = document.getElementById("user-video");

  // --- STATE VARIABLES ---
  let mediaRecorder;
  let audioChunks = [];
  let recordedAudioBlob; 
  let speechVoices = [];
  let currentQuestionText = ""; 
  let isAiSpeaking = false;
  let localStream; 
  
  // --- FACE ANALYSIS VARIABLES ---
  let faceDetectionInterval;
  let expressionData = []; // This will store the results

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
      
      modelStatus.innerText = "✅ AI Models Loaded. Ready to Generate!";
      generateButton.disabled = false;
    } catch (error) {
      modelStatus.innerText = "❌ Error loading local AI models. Check the /models folder and refresh.";
      console.error("Error loading face-api models:", error);
    }
  }

  // --- 2. LOAD VOICES & INITIALIZE ---
  function loadVoices() {
    speechVoices = window.speechSynthesis.getVoices();
  }
  window.speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();

  generateButton.disabled = true;
  loadFaceApiModels(); 

  // --- 3. CLICK LISTENERS ---
  generateButton.addEventListener("click", generateQuestion);
  recordButton.addEventListener("click", startRecording);
  stopButton.addEventListener("click", stopRecording);
  feedbackButton.addEventListener("click", getFeedback); 
  speechPlayButton.addEventListener("click", toggleAiSpeech);

  // --- 4. GENERATE QUESTION ---
  async function generateQuestion() {
    stopAllAudioAndVideo(); 
    const topic = topicSelect.value;
    questionInput.value = "Generating question, please wait...";
    responseBox.innerText = "Your feedback will appear here...";
    feedbackButton.disabled = true;
    audioPlayback.style.display = "none";
    speechPlayButton.style.display = "none";

    try {
      const response = await fetch("https://prepmateai-project-production.up.railway.app/generate-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "topic": topic }),
      });
      const data = await response.json();
      
      if (data.error) {
        questionInput.value = `Error: ${data.error}`;
      } else {
        questionInput.value = data.question;
        currentQuestionText = data.question; 
        isAiSpeaking = false;
        speechPlayButton.innerText = "▶️ Play Question";
        speechPlayButton.style.display = "inline-block";
      }
    } catch (error) {
      questionInput.value = "⚠️ Server not responding. Make sure backend is running.";
      console.error("Fetch error:", error);
    }
  }

  // --- 5. PLAY AI SPEECH ---
  function playAiSpeech() {
    if (!currentQuestionText) return; 
    window.speechSynthesis.cancel(); 
    const utterance = new SpeechSynthesisUtterance(currentQuestionText);

    if (speechVoices.length === 0) loadVoices();
    let preferredVoice = speechVoices.find(voice => 
      (voice.lang === 'en-US' || voice.lang === 'en-GB') && 
      (voice.name.includes('Google') || voice.name.includes('Natural') || voice.name.includes('David') || voice.name.includes('Zira'))
    );
    if (!preferredVoice) {
      preferredVoice = speechVoices.find(voice => voice.lang === 'en-US');
    }
    if (preferredVoice) utterance.voice = preferredVoice;
    
    utterance.onstart = () => {
      isAiSpeaking = true;
      speechPlayButton.innerText = "⏹️ Stop";
      speechPlayButton.style.display = "inline-block";
    };
    utterance.onend = () => {
      isAiSpeaking = false;
      speechPlayButton.innerText = "▶️ Replay Question";
      speechPlayButton.style.display = "inline-block";
    };
    utterance.onerror = () => {
      isAiSpeaking = false;
      speechPlayButton.innerText = "▶️ Replay Question";
      speechPlayButton.style.display = "inline-block";
    };
    window.speechSynthesis.speak(utterance);
  }

  // --- 6. TOGGLE AI SPEECH ---
  function toggleAiSpeech() {
    if (isAiSpeaking) {
      window.speechSynthesis.cancel();
      isAiSpeaking = false;
      speechPlayButton.innerText = "▶️ Replay Question";
    } else {
      playAiSpeech();
    }
  }

  // --- 7. START RECORDING ---
  async function startRecording() {
    stopAllAudioAndVideo(); 
    
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      videoContainer.style.display = "block";
      userVideo.srcObject = localStream;
      userVideo.play(); 
      
      mediaRecorder = new MediaRecorder(localStream);
      audioChunks = [];

      mediaRecorder.onstart = () => {
        recordStatus.innerText = "Recording...";
        recordButton.disabled = true;
        stopButton.disabled = false;
        feedbackButton.disabled = true;
        audioPlayback.style.display = "none";
        
        // Start face analysis
        console.log("Starting face detection...");
        expressionData = []; // Clear old data
        faceDetectionInterval = setInterval(async () => {
          if (userVideo.paused || userVideo.ended) return;
          
          const detections = await faceapi.detectSingleFace(userVideo, new faceapi.TinyFaceDetectorOptions())
                                        .withFaceLandmarks()
                                        .withFaceExpressions();
          
          if (detections && detections.expressions) {
            let mainExpression = Object.keys(detections.expressions).reduce((a, b) => 
              detections.expressions[a] > detections.expressions[b] ? a : b
            );
            console.log(mainExpression);
            expressionData.push(mainExpression);
          }
        }, 1000);
      };

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        clearInterval(faceDetectionInterval); // Stop the loop
        console.log("Stopping face detection.");
        console.log("Final Expression Data:", expressionData);

        localStream.getTracks().forEach(track => track.stop());
        videoContainer.style.display = "none";
        userVideo.srcObject = null;
        
        recordedAudioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const audioUrl = URL.createObjectURL(recordedAudioBlob);
        audioPlayback.src = audioUrl;
        audioPlayback.style.display = "block"; 
        recordStatus.innerText = "Recording stopped. Press Submit.";
        recordButton.disabled = false;
        stopButton.disabled = true;
        feedbackButton.disabled = false;
      };

      mediaRecorder.start();

    } catch (error) {
      recordStatus.innerText = "⚠️ Mic/Cam permission denied.";
      console.error("Error accessing media devices:", error);
    }
  }

  // --- 8. STOP RECORDING ---
  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      clearInterval(faceDetectionInterval);
      console.log("Stopping face detection from stop button.");
    }
  }

  // --- 9. GET FEEDBACK (MODIFIED) ---
  async function getFeedback() {
    stopAllAudioAndVideo();
    const question = questionInput.value;

    if (!recordedAudioBlob) {
      responseBox.innerText = "⚠️ Please record an answer first.";
      return;
    }
    if (!question || question.startsWith("Generating...")) {
      responseBox.innerText = "⚠️ Please generate a question first.";
      return;
    }

    // --- ⭐️ NEW CODE: Update loading message ---
    responseBox.innerText = "Thinking... (Transcribing audio and analyzing expressions) 🤔";
    feedbackButton.disabled = true;

    const formData = new FormData();
    formData.append("audio_file", recordedAudioBlob, "my_answer.webm");
    formData.append("question", question);
    
    // --- ⭐️ NEW CODE: Add expression data ---
    // Convert the array to a JSON string to send it
    formData.append("expressions", JSON.stringify(expressionData));
    // --- ⭐️ END NEW CODE ---

    try {
      const response = await fetch("https://prepmateai-project-production.up.railway.app/interview", {
        method: "POST",
        body: formData, 
      });
      const data = await response.json();
      responseBox.innerText = data.error ? `⚠️ Error: ${data.error}` : data.feedback;
    } catch (error) {
      responseBox.innerText = "⚠️ Server not responding. Make sure backend is running.";
      console.error("Fetch error:", error);
    }
    feedbackButton.disabled = false;
  }
  
  // --- 10. HELPER FUNCTION ---
  function stopAllAudioAndVideo() {
    window.speechSynthesis.cancel();
    isAiSpeaking = false;
    
    clearInterval(faceDetectionInterval); 

    if (mediaRecorder && mediaRecorder.state === "recording") {
        stopRecording(); 
    }
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      videoContainer.style.display = "none";
      userVideo.srcObject = null;
    }
  }
} // --- END of initializeApp function ---


// --- POLLING FUNCTION (Unchanged) ---
function waitForFaceApi() {
  if (typeof faceapi !== 'undefined') {
    console.log("face-api.js loaded. Initializing app.");
    initializeApp();
  } else {
    console.log("Waiting for face-api.js...");
    setTimeout(waitForFaceApi, 100);
  }
}

// Start the check
waitForFaceApi();