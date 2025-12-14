const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const emotionText = document.getElementById("emotion");
const landmarkData = document.getElementById("landmarkData");

// For calculating averages and smoothing
let emotionHistory = [];
const HISTORY_LENGTH = 5;

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

// Normalize distance function
function getDistance(p1, p2) {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) + Math.pow(p2.z - p1.z, 2));
}

// Calculate eye aspect ratio (EAR) for eye openness
function getEyeAspectRatio(eyeLandmarks) {
  // Vertical distances
  const vertical1 = getDistance(eyeLandmarks[1], eyeLandmarks[5]);
  const vertical2 = getDistance(eyeLandmarks[2], eyeLandmarks[4]);
  
  // Horizontal distance
  const horizontal = getDistance(eyeLandmarks[0], eyeLandmarks[3]);
  
  // EAR formula
  return (vertical1 + vertical2) / (2.0 * horizontal);
}

// Calculate mouth aspect ratio (MAR)
function getMouthAspectRatio(mouthLandmarks) {
  // Vertical distances
  const vertical1 = getDistance(mouthLandmarks[13], mouthLandmarks[14]);
  const vertical2 = getDistance(mouthLandmarks[78], mouthLandmarks[308]);
  
  // Horizontal distance
  const horizontal = getDistance(mouthLandmarks[61], mouthLandmarks[291]);
  
  return (vertical1 + vertical2) / (2.0 * horizontal);
}

faceMesh.onResults((results) => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw video frame (mirrored)
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    emotionText.innerText = "No face detected";
    landmarkData.innerText = "No landmarks";
    return;
  }

  const landmarks = results.multiFaceLandmarks[0];
  
  // Define key landmark indices (MediaPipe FaceMesh 478 landmarks)
  const LANDMARK_INDICES = {
    // Left eye (looking at camera, so right side of image)
    leftEye: [33, 133, 157, 158, 159, 160, 161, 173, 246],
    // Right eye (left side of image)
    rightEye: [362, 263, 386, 387, 388, 389, 390, 373, 466],
    // Mouth outer
    mouth: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
    // Mouth inner
    mouthInner: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191],
    // Eyebrows
    leftEyebrow: [70, 63, 105, 66, 107],
    rightEyebrow: [300, 293, 334, 296, 336],
    // Nose
    nose: [1, 2, 98, 327]
  };
  
  // Extract specific landmarks for emotion calculation
  const leftEyePoints = LANDMARK_INDICES.leftEye.map(i => landmarks[i]);
  const rightEyePoints = LANDMARK_INDICES.rightEye.map(i => landmarks[i]);
  const mouthPoints = LANDMARK_INDICES.mouth.map(i => landmarks[i]);
  const mouthInnerPoints = LANDMARK_INDICES.mouthInner.map(i => landmarks[i]);
  
  // Calculate EAR for both eyes
  const leftEAR = getEyeAspectRatio([
    landmarks[33], landmarks[160], landmarks[158], landmarks[133], landmarks[153], landmarks[144]
  ]);
  
  const rightEAR = getEyeAspectRatio([
    landmarks[362], landmarks[385], landmarks[387], landmarks[263], landmarks[373], landmarks[380]
  ]);
  
  const avgEAR = (leftEAR + rightEAR) / 2;
  
  // Calculate MAR
  const mar = getMouthAspectRatio(landmarks);
  
  // Get mouth openness
  const mouthOpen = getDistance(landmarks[13], landmarks[14]); // Upper and lower lip center
  
  // Get mouth width
  const mouthWidth = getDistance(landmarks[61], landmarks[291]); // Mouth corners
  
  // Eyebrow height difference (for surprise)
  const leftEyebrowY = landmarks[70].y;  // Left eyebrow center
  const rightEyebrowY = landmarks[300].y; // Right eyebrow center
  const avgEyebrowY = (leftEyebrowY + rightEyebrowY) / 2;
  const eyeY = (landmarks[33].y + landmarks[362].y) / 2; // Eye position
  
  const eyebrowRaise = eyeY - avgEyebrowY; // Higher value = eyebrows more raised
  
  // Update landmark data display
  landmarkData.innerHTML = `EAR: ${avgEAR.toFixed(3)} | MAR: ${mar.toFixed(3)}<br>
                           Mouth Open: ${mouthOpen.toFixed(3)} | Eyebrow: ${eyebrowRaise.toFixed(3)}`;
  
  // Emotion detection logic with thresholds
  let emotion = "Neutral";
  let confidence = 0;
  
  // HAPPY 😊 - Wide smile, eyes may be slightly narrowed
  if (mar > 0.35 && mouthWidth > 0.25 && avgEAR > 0.15 && avgEAR < 0.25) {
    emotion = "Happy 😊";
    confidence = Math.min(1.0, (mar - 0.3) * 3);
  }
  // SURPRISED 😮 - Wide open mouth + raised eyebrows + wide eyes
  else if (mar > 0.45 && avgEAR > 0.25 && eyebrowRaise > 0.02) {
    emotion = "Surprised 😮";
    confidence = Math.min(1.0, (mar - 0.4) * 2);
  }
  // SAD 😔 - Downturned mouth, droopy eyes
  else if (mar < 0.25 && avgEAR < 0.15 && eyebrowRaise < -0.01) {
    emotion = "Sad 😔";
    confidence = Math.min(1.0, (0.25 - mar) * 4);
  }
  // ANGRY 😠 - Narrowed eyes, tight mouth
  else if (avgEAR < 0.12 && mar < 0.25 && mouthWidth < 0.2 && eyebrowRaise < -0.02) {
    emotion = "Angry 😠";
    confidence = Math.min(1.0, (0.15 - avgEAR) * 5);
  }
  // SLEEPY 😴 - Very closed eyes
  else if (avgEAR < 0.08) {
    emotion = "Sleepy 😴";
    confidence = Math.min(1.0, (0.08 - avgEAR) * 8);
  }
  // NEUTRAL 😐 - Normal ranges
  else {
    emotion = "Neutral 😐";
    confidence = 0.7;
  }
  
  // Smooth emotion transitions using history
  emotionHistory.push(emotion);
  if (emotionHistory.length > HISTORY_LENGTH) {
    emotionHistory.shift();
  }
  
  // Get most frequent emotion from history
  const emotionCounts = {};
  emotionHistory.forEach(e => {
    emotionCounts[e] = (emotionCounts[e] || 0) + 1;
  });
  
  let finalEmotion = emotion;
  let maxCount = 0;
  for (const [emote, count] of Object.entries(emotionCounts)) {
    if (count > maxCount) {
      maxCount = count;
      finalEmotion = emote;
    }
  }
  
  // Display emotion with confidence
  emotionText.innerText = `${finalEmotion} (${(confidence * 100).toFixed(0)}% sure)`;
  
  // Draw face mesh for debugging
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  
  if (window.drawConnectors) {
    // Draw all face landmarks
    drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {
      color: '#00FF00',
      lineWidth: 1
    });
    
    // Draw eye landmarks in blue
    drawConnectors(ctx, landmarks, FACEMESH_LEFT_EYE, {color: '#0066FF', lineWidth: 2});
    drawConnectors(ctx, landmarks, FACEMESH_RIGHT_EYE, {color: '#0066FF', lineWidth: 2});
    
    // Draw mouth landmarks in red
    drawConnectors(ctx, landmarks, FACEMESH_LIPS, {color: '#FF0066', lineWidth: 2});
  }
  
  // Draw key points
  [13, 14, 61, 291, 70, 300, 33, 362].forEach(index => {
    const point = landmarks[index];
    ctx.beginPath();
    ctx.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#FFFF00';
    ctx.fill();
  });
  
  ctx.restore();
});

// Start camera with error handling
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user"
      },
      audio: false
    });
    
    video.srcObject = stream;
    
    video.onloadedmetadata = () => {
      // Set initial canvas size
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Start face detection
      async function detectFace() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          await faceMesh.send({ image: video });
        }
        requestAnimationFrame(detectFace);
      }
      
      detectFace();
    };
    
  } catch (error) {
    console.error("Camera error:", error);
    emotionText.innerText = "Camera access denied";
    emotionText.style.color = "#FF5555";
    
    // Fallback: Use a sample image for testing
    emotionText.innerHTML = "Camera blocked. Using test mode.<br>Try expressions: smile, surprise, frown";
    
    // Create a test loop with dummy data
    const testEmotions = ["Happy 😊", "Neutral 😐", "Surprised 😮", "Sad 😔", "Angry 😠"];
    let testIndex = 0;
    setInterval(() => {
      emotionText.innerText = `Test: ${testEmotions[testIndex]}`;
      testIndex = (testIndex + 1) % testEmotions.length;
    }, 2000);
  }
}

// Add instructions
window.onload = () => {
  setTimeout(() => {
    alert("Face Emotion Detection Started!\n\nTry these expressions:\n• Smile big for HAPPY\n• Open mouth wide for SURPRISED\n• Frown for SAD\n• Squint eyes for ANGRY\n• Close eyes for SLEEPY");
  }, 500);
  startCamera();
};
