const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const emotionText = document.getElementById("emotion");

// Initialize FaceMesh
const faceMesh = new FaceMesh({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
  }
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults((results) => {
  // Set canvas size to match video
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw video frame
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1); // Mirror for better UX
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    emotionText.innerText = "No face detected";
    return;
  }

  const landmarks = results.multiFaceLandmarks[0];

  // Key landmark indices (MediaPipe FaceMesh has 478 landmarks)
  // Mouth landmarks
  const mouthTop = landmarks[13];     // Top lip center
  const mouthBottom = landmarks[14];  // Bottom lip center
  const leftMouth = landmarks[61];    // Left mouth corner
  const rightMouth = landmarks[291];  // Right mouth corner
  
  // Eye landmarks (using more accurate indices)
  const leftEyeTop = landmarks[159];   // Upper lid left eye
  const leftEyeBottom = landmarks[145]; // Lower lid left eye
  
  // Eyebrow landmarks for surprise detection
  const leftEyebrow = landmarks[70];
  const rightEyebrow = landmarks[300];

  // Calculate distances
  const mouthOpen = Math.abs(mouthTop.y - mouthBottom.y);
  const mouthWidth = Math.abs(leftMouth.x - rightMouth.x);
  const eyeOpen = Math.abs(leftEyeTop.y - leftEyeBottom.y);
  const eyebrowRaise = Math.abs(leftEyebrow.y - rightEyebrow.y);

  // Determine emotion based on thresholds
  let emotion = "Neutral 😐";
  
  // Happy: wide smile with open mouth
  if (mouthOpen > 0.04 && mouthWidth > 0.15) {
    emotion = "Happy 😊";
  } 
  // Surprised: wide open mouth + raised eyebrows
  else if (mouthOpen > 0.07 && eyebrowRaise > 0.03) {
    emotion = "Surprised 😮";
  }
  // Sad: droopy eyes, less open
  else if (eyeOpen < 0.01 && mouthWidth < 0.1) {
    emotion = "Sad 😔";
  }
  // Sleepy: very closed eyes
  else if (eyeOpen < 0.005) {
    emotion = "Sleepy 😴";
  }

  emotionText.innerText = emotion;

  // Draw face mesh (optional)
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1); // Mirror drawing to match video
  
  // Draw connections
  if (window.drawConnectors) {
    drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {
      color: "#00FF00",
      lineWidth: 1
    });
  }
  
  ctx.restore();
});

// Start camera
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user" // Front camera
      },
      audio: false
    });
    
    video.srcObject = stream;
    
    // Wait for video to be ready
    video.onloadedmetadata = () => {
      // Start face detection
      faceMesh.send({ image: video });
      
      // Continue processing frames
      function processFrame() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          faceMesh.send({ image: video });
        }
        requestAnimationFrame(processFrame);
      }
      processFrame();
    };
    
  } catch (error) {
    console.error("Camera error:", error);
    emotionText.innerText = "Camera access denied or error";
  }
}

// Start everything when page loads
window.onload = startCamera;
