// This is a new function that will run all our code
function initializeApp() {
  
  // --- GET ALL HTML ELEMENTS ---
  const uploadScreen = document.getElementById("upload-screen");
  const interviewScreen = document.getElementById("interview-screen");
  const feedbackScreen = document.getElementById("feedback-screen");

  // Upload elements
  const resumeUploadInput = document.getElementById("resume-upload");
  const uploadBtn = document.getElementById("upload-btn");
  const resumeStatus = document.getElementById("resume-status");
  
  const loadingSpinner = document.getElementById("loading-spinner");
  const spinnerTest = document.getElementById("spinner-text"); 
  const modelStatus = document.getElementById("model-status");
  
  // Chat elements
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
  let faceDetectionInterval;
  let expressionData = []; 
  let conversationHistory = []; 
  
  // --- RESUME STATE ---
  let practiceResumeText = ""; 

  // --- SPEECH SYNTHESIS VARIABLES --- 
  let speechVoices = [];
  let isMuted = false; 

  // --- 1. LOAD AI MODELS ---
  async function loadFaceApiModels() {
    spinnerTest.innerText = "Loading AI Face Models...";
    loadingSpinner.style.display = "flex";
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceExpressionNet.loadFromUri('/models')
      ]);
      resumeStatus.innerText = "✅ AI Models Loaded. Please upload your resume.";
    } catch (error) {
      resumeStatus.innerText = "❌ Error loading local AI models. Check the /models folder and refresh.";
      console.error("Error loading face-api models:", error);
    }
    loadingSpinner.style.display = "none";
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
  uploadBtn.addEventListener("click", handleResumeUpload);
  recordButton.addEventListener("click", startRecording);
  stopButton.addEventListener("click", stopRecording);

  muteBtn.addEventListener("click", () => {
      isMuted = !isMuted; 
      if (isMuted) {
          window.speechSynthesis.cancel(); 
          muteBtn.innerText = "🔊 Unmute Voice";
          muteBtn.classList.remove("tool-button-secondary");
          muteBtn.classList.add("tool-button-primary");
      } else {
          muteBtn.innerText = "🔇 Mute Voice";
          muteBtn.classList.add("tool-button-secondary");
          muteBtn.classList.remove("tool-button-primary");
          if (conversationHistory.length > 0) {
              const lastMessage = conversationHistory[conversationHistory.length - 1];
              if (lastMessage.role === 'ai') {
                  speak(lastMessage.content);
              }
          }
      }
  });

  // --- 5. RESUME UPLOAD LOGIC ---
  async function handleResumeUpload() {
      const file = resumeUploadInput.files[0];
      if (!file) {
          resumeStatus.innerText = "Please select a file first.";
          return;
      }

      spinnerTest.innerText = "Uploading and processing resume...";
      loadingSpinner.style.display = "flex";

      const formData = new FormData();
      formData.append("resume_file", file);

      try {
          const response = await fetch("https://prepmateai-project.vercel.app/upload-practice-resume", {
              method: "POST",
              body: formData,
          });

          const data = await response.json();
          loadingSpinner.style.display = "none";

          if (data.error) {
              resumeStatus.innerText = `Error: ${data.error}`;
          } else {
              practiceResumeText = data.resume_text; // Store the resume text
              startInterview(); // Start the interview!
          }
      } catch (error) {
          loadingSpinner.style.display = "none";
          resumeStatus.innerText = "⚠️ Server not responding. Make sure backend is running.";
          console.error("Upload error:", error);
      }
  }


  // --- 6. CHAT UI FUNCTIONS ---
  function addMessageToChat(role, text) {
      const bubble = document.createElement('div');
      bubble.classList.add('chat-bubble', role); 
      
      const roleStrong = document.createElement('strong');
      roleStrong.innerText = (role === 'ai') ? 'Prepmate' : 'You';
      
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

  // --- 7. SPEECH FUNCTION (⭐️ UPDATED ⭐️) --- 
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

  // --- 8. START INTERVIEW ---
  async function startInterview() {
    uploadScreen.classList.add("hidden"); // Hide upload UI
    interviewScreen.classList.remove("hidden"); // Show chat UI
    showTyping(true);
    await sendAnswerToBackend(null, null); 
  }

  // --- 9. START RECORDING ---
  async function startRecording() {
    window.speechSynthesis.cancel(); 

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
          const detections = await faceapi.detectSingleFace(userVideo, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();
          if (detections && detections.expressions) {
            let mainExpression = Object.keys(detections.expressions).reduce((a, b) => 
              detections.expressions[a] > detections.expressions[b] ? a : b
            );
            expressionData.push(mainExpression);
          }
        }, 1000);
      };

      mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);

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

  // --- 10. STOP RECORDING ---
  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }

  // --- 11. CORE LOGIC: SEND ANSWER TO BACKEND ---
  async function sendAnswerToBackend(audioBlob, expressionsJSON) {
      showTyping(true);
      recordStatus.innerText = "Prepmate is analyzing...";

      const formData = new FormData();
      formData.append("resume_text", practiceResumeText); 
      formData.append("conversation_history", JSON.stringify(conversationHistory));
      
      if (audioBlob) {
        formData.append("audio_file", audioBlob, "my_answer.webm");
        formData.append("expressions", expressionsJSON);
      }

      try {
        const response = await fetch("https://prepmateai-project.vercel.app/resume-conversation", {
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
              speak(data.ai_response); 
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

  // --- 12. SHOW FINAL REPORT ---
  function showFinalReport(reportText) {
      interviewScreen.classList.add("hidden");
      feedbackScreen.classList.remove("hidden");
      feedbackReport.innerText = reportText;
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