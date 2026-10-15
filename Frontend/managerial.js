function convertMarkdownToProHTML(md) {
    if (!md) return "";
    md = md.replace(/^### (.*$)/gim, '<div class="ai-mini-heading">$1</div>');
    md = md.replace(/^- (.*$)/gim, '<div class="ai-bullet">• $1</div>');
    md = md.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
    md = md.replace(/\n/g, '<br>');
    return md;
}

// This is a new function that will run all our code
function initializeApp() {
  
  // --- GET ALL HTML ELEMENTS ---
  const setupScreen = document.getElementById("setup-screen");
  const interviewScreen = document.getElementById("interview-screen");
  const feedbackScreen = document.getElementById("feedback-screen");
  
  const loadingSpinner = document.getElementById("loading-spinner");
  const spinnerTest = document.getElementById("spinner-text"); 

  const startBtn = document.getElementById("start-btn");
  const modelStatus = document.getElementById("model-status");
  
  const chatContainer = document.getElementById("chat-container");
  const typingIndicator = document.getElementById("typing-indicator");
  
  const videoContainer = document.getElementById("video-container");
  const userVideo = document.getElementById("user-video");

  const muteBtn = document.getElementById("mute-btn"); 
  
  const recordButton = document.getElementById("record-button");
  const stopButton = document.getElementById("stop-button");
  const recordStatus = document.getElementById("record-status");

  const feedbackReport = document.getElementById("feedback-report");

  // --- STATE VARIABLES ---
  let mediaRecorder;
  let audioChunks = [];
  let recordedAudioBlob; 
  let localStream; 
  
  // --- FACE ANALYSIS VARIABLES ---
  let faceDetectionInterval;
  let expressionData = []; 

  // --- CONVERSATION STATE ---
  let conversationHistory = []; 
  let questionCount = 0;

  // --- SPEECH SYNTHESIS VARIABLES --- 
  let speechVoices = [];
  let isMuted = false; 

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

  // --- 2. LOAD VOICES ---
  function loadVoices() {
    speechVoices = window.speechSynthesis.getVoices();
  }
  window.speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();

  // --- 3. INITIALIZE ---
  loadFaceApiModels(); 

  // --- 4. CLICK LISTENERS ---
  startBtn.addEventListener("click", startInterview);
  recordButton.addEventListener("click", startRecording);
  stopButton.addEventListener("click", stopRecording);

  muteBtn.addEventListener("click", () => {
      isMuted = !isMuted; // Toggle the mute state
      if (isMuted) {
          window.speechSynthesis.cancel(); // Stop any current speech
          muteBtn.innerText = "🔊 Unmute Voice";
          muteBtn.classList.remove("tool-button-secondary");
          muteBtn.classList.add("tool-button-primary"); // Make it blue
      } else {
          muteBtn.innerText = "🔇 Mute Voice";
          muteBtn.classList.add("tool-button-secondary");
          muteBtn.classList.remove("tool-button-primary"); // Make it grey
          
          if (conversationHistory.length > 0) {
              const lastMessage = conversationHistory[conversationHistory.length - 1];
              if (lastMessage.role === 'ai') {
                  speak(lastMessage.content);
              }
          }
      }
  });


  // --- 5. CHAT UI FUNCTIONS ---
  function addMessageToChat(role, text) {
      const bubble = document.createElement('div');
      bubble.classList.add('chat-bubble', role); 
      
      const roleStrong = document.createElement('strong');
      roleStrong.innerText = (role === 'ai') ? 'PrepAura' : 'You';
      
      const textNode = document.createElement('span');
      textNode.innerText = text;
      
      bubble.appendChild(roleStrong);
      bubble.appendChild(textNode);
      chatContainer.appendChild(bubble);
      
      chatContainer.scrollTop = chatContainer.scrollHeight;
  }
  
  function showTyping(show) {
      typingIndicator.classList.toggle('hidden', !show);
      if (show) {
          chatContainer.scrollTop = chatContainer.scrollHeight;
      }
  }

  // --- 6. SPEECH FUNCTION (⭐️ UPDATED ⭐️) --- 
  function speak(text) {
      if (isMuted) {
          return;
      }

      window.speechSynthesis.cancel(); 
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Ensure voices are loaded
      if (speechVoices.length === 0) {
          loadVoices();
      }

      let preferredVoice = speechVoices.find(voice => 
        (voice.lang === 'en-US' || voice.lang === 'en-GB') && 
        (voice.name.includes('Google') || voice.name.includes('Natural'))
      );

      // Fallback to the first available 'en-US' voice
      if (!preferredVoice) {
        preferredVoice = speechVoices.find(voice => voice.lang === 'en-US');
      }
      
      utterance.voice = preferredVoice;

      utterance.onerror = () => {
        console.error("Speech synthesis error.");
      };
      window.speechSynthesis.speak(utterance);
  }

  // --- 7. START INTERVIEW ---
  async function startInterview() {
    setupScreen.classList.add("hidden");
    interviewScreen.classList.remove("hidden");
    showTyping(true);
    await sendAnswerToBackend(null, null); 
  }

  // --- 8. START RECORDING ---
  async function startRecording() {
    window.speechSynthesis.cancel(); // Stop AI from talking

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
        
        expressionData = []; 
        faceDetectionInterval = setInterval(async () => {
          if (userVideo.paused || userVideo.ended) return;
          
          const detections = await faceapi.detectSingleFace(userVideo, new faceapi.TinyFaceDetectorOptions())
                                        .withFaceExpressions();
          
          if (detections && detections.expressions) {
            let mainExpression = Object.keys(detections.expressions).reduce((a, b) => 
              detections.expressions[a] > detections.expressions[b] ? a : b
            );
            expressionData.push(mainExpression);
          }
        }, 1000);
      };

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        clearInterval(faceDetectionInterval); 

        localStream.getTracks().forEach(track => track.stop());
        videoContainer.style.display = "none";
        userVideo.srcObject = null;
        
        recordedAudioBlob = new Blob(audioChunks, { type: "audio/webm" });
        
        recordStatus.innerText = "Recording stopped. Submitting...";
        recordButton.disabled = true; 
        stopButton.disabled = true;

        sendAnswerToBackend(recordedAudioBlob, JSON.stringify(expressionData));
      };

      mediaRecorder.start();

    } catch (error) {
      recordStatus.innerText = "⚠️ Mic/Cam permission denied.";
      console.error("Error accessing media devices:", error);
    }
  }

  // --- 9. STOP RECORDING ---
  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }

  // --- 10. CORE LOGIC: SEND ANSWER TO BACKEND ---
  async function sendAnswerToBackend(audioBlob, expressionsJSON) {
      showTyping(true);
      recordStatus.innerText = "PrepAura is analyzing...";

      const formData = new FormData();
      formData.append("conversation_history", JSON.stringify(conversationHistory));
      
      if (audioBlob) {
        formData.append("audio_file", audioBlob, "my_answer.webm");
        formData.append("expressions", expressionsJSON);
      }

      try {
        const response = await fetch("https://prepmateai-project-production.up.railway.app/managerial-conversation", {
          method: "POST",
          body: formData, 
        });
        
        const data = await response.json();
        showTyping(false); 

        if (data.error) {
          addMessageToChat('ai', `⚠️ Error: ${data.error}`);
          return;
        }

        if (data.user_transcript) {
            addMessageToChat('user', data.user_transcript);
        }
        
        if (data.ai_response) {
            addMessageToChat('ai', data.ai_response);
            if (!data.session_complete) {
              speak(data.ai_response); // Make the AI speak
            }
        }

        conversationHistory = data.updated_history;

        if (data.session_complete) {
          showFinalReport(data.final_report);
        } else {
          recordButton.disabled = false; 
          recordStatus.innerText = "Press 'Record Answer'";
        }
        
      } catch (error) {
        showTyping(false);
        addMessageToChat('ai', "⚠️ Server not responding. Make sure backend is running.");
        console.error("Fetch error:", error);
      }
  }

  // --- 11. SHOW FINAL REPORT ---
  function showFinalReport(reportText, wpm = 0, fillerCount = 0) {
    interviewScreen.classList.add("hidden");
    feedbackScreen.classList.remove("hidden");

    const scoreMatch = reportText.match(/SCORE:\s*(\d+)%/i);
    const numericalScore = scoreMatch ? parseInt(scoreMatch[1]) : 0;
    const cleanedReport = reportText.replace(/SCORE:\s*\d+%/i, "").trim();

    const overallMatch = cleanedReport.match(/1\.\s*Overall Performance:?([\s\S]*?)(?=2\.)/i);
    const strengthsMatch = cleanedReport.match(/2\.\s*Strengths:?([\s\S]*?)(?=3\.)/i);
    const areasMatch = cleanedReport.match(/3\.\s*Areas for Improvement:?([\s\S]*?)$/i);

    const formatHTML = (txt) => txt ? txt.trim().replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>') : "Analyzing...";

    feedbackReport.innerHTML = `
      <div class="apt-report">
        <div class="report-top-row">
          <div class="apt-score-wrapper">
            <svg class="apt-score-ring" viewBox="0 0 140 140">
              <circle class="apt-score-bg" cx="70" cy="70" r="60"></circle>
              <circle id="report-ring" class="apt-score-progress" cx="70" cy="70" r="60"></circle>
            </svg>
            <div class="apt-score-text" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column;">
              <div style="font-size:1.8rem; font-weight:800; color:#fff;">${numericalScore}%</div>
              <div style="font-size:0.7rem; color:#38bdf8; text-transform:uppercase;">Overall</div>
            </div>
          </div>
        </div>

        <div class="ai-cards-grid">
          <div class="ai-card">
            <h4 style="color:#a78bfa;">🎯 Overall Performance</h4>
            <div class="ai-content">${formatHTML(overallMatch ? overallMatch[1] : "")}</div>
          </div>
          <div class="ai-card">
            <h4 style="color:#34d399;">🌟 Top Strengths</h4>
            <div class="ai-content">${formatHTML(strengthsMatch ? strengthsMatch[1] : "")}</div>
          </div>
          <div class="ai-card">
            <h4 style="color:#fb7185;">🚩 Areas for Growth</h4>
            <div class="ai-content">${formatHTML(areasMatch ? areasMatch[1] : "")}</div>
          </div>
          <div class="ai-card">
            <h4 style="color:#38bdf8;">🎙️ Delivery & Tone</h4>
            <div class="ai-content" id="delivery-stats">
                ${renderDetailedDeliveryMetrics(wpm, fillerCount)}
            </div>
          </div>
        </div>
      </div>
    `;

    animateRing(numericalScore / 100);
}

function renderDetailedDeliveryMetrics(wpm, fillerCount) {
    // 1. Process facial expression data
    const emotionCounts = expressionData.reduce((acc, curr) => { 
        acc[curr] = (acc[curr] || 0) + 1; 
        return acc; 
    }, {});
    
    const topEmotion = Object.keys(emotionCounts).length > 0 
        ? Object.keys(emotionCounts).reduce((a, b) => emotionCounts[a] > emotionCounts[b] ? a : b)
        : "Neutral";

    // 2. Format the delivery metrics card
    return `
        <div class="ai-bullet">• <strong>Dominant Emotion:</strong> ${topEmotion.charAt(0).toUpperCase() + topEmotion.slice(1)}</div>
        <div class="ai-bullet">• <strong>Speech Pace:</strong> ${wpm || 0} WPM</div>
        <div class="ai-bullet">• <strong>Filler Words:</strong> ${fillerCount || 0} detected</div>
        <div class="ai-bullet">• <strong>Analysis Status:</strong> Completed</div>
        <div class="ai-bullet">• <strong>Methodology:</strong> STAR Evaluation</div>
    `;
}
  
} // --- END of initializeApp function ---


// --- POLLING FUNCTION ---
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