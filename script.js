
// DOM Elements
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const emotionElement = document.getElementById("emotion");
const confidenceElement = document.getElementById("confidence");
const loadingElement = document.getElementById("loading");
const statusElement = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");

// State variables
let faceMesh = null;
let cameraRunning = false;
let debugMode = false;
let emotionHistory = [];
const HISTORY_LENGTH = 10;

// Initialize the application
async function init() {
    statusElement.textContent = "Loading Face Mesh model...";
    
    try {
        // Check if MediaPipe is available
        if (typeof FaceMesh === 'undefined') {
            throw new Error("MediaPipe Face Mesh failed to load. Please check your internet connection.");
        }
        
        // Initialize FaceMesh
        faceMesh = new FaceMesh({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
            }
        });
        
        // Configure FaceMesh
        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
            selfieMode: true  // Mirror the camera view
        });
        
        // Set up results handler
        faceMesh.onResults(onFaceMeshResults);
        
        statusElement.textContent = "Model loaded successfully!";
        loadingElement.style.display = "none";
        
        // Auto-start camera after a short delay
        setTimeout(startCamera, 1000);
        
    } catch (error) {
        console.error("Initialization error:", error);
        statusElement.textContent = `Error: ${error.message}`;
        statusElement.style.color = "#ff6b6b";
        emotionElement.textContent = "Failed to load AI model";
    }
}

// Calculate Euclidean distance between two points
function getDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = (p2.z || 0) - (p1.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Calculate Eye Aspect Ratio (EAR)
function calculateEAR(eyeLandmarks) {
    // Vertical distances
    const A = getDistance(eyeLandmarks[1], eyeLandmarks[5]);
    const B = getDistance(eyeLandmarks[2], eyeLandmarks[4]);
    // Horizontal distance
    const C = getDistance(eyeLandmarks[0], eyeLandmarks[3]);
    
    return (A + B) / (2.0 * C);
}

// Calculate Mouth Aspect Ratio (MAR)
function calculateMAR(mouthLandmarks) {
    const A = getDistance(mouthLandmarks[13], mouthLandmarks[14]);  // Top to bottom lip (center)
    const B = getDistance(mouthLandmarks[78], mouthLandmarks[308]); // Top to bottom (sides)
    const C = getDistance(mouthLandmarks[61], mouthLandmarks[291]); // Mouth width
    
    return (A + B) / (2.0 * C);
}

// Process FaceMesh results
function onFaceMeshResults(results) {
    if (!cameraRunning) return;
    
    // Update canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw the video frame
    ctx.save();
    if (faceMesh.options.selfieMode) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    
    // Check if face is detected
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        emotionElement.textContent = "No face detected";
        confidenceElement.textContent = "Make sure your face is visible in the camera";
        return;
    }
    
    const landmarks = results.multiFaceLandmarks[0];
    
    // Calculate facial metrics
    // Eye landmarks
    const leftEyeEAR = calculateEAR([
        landmarks[33], landmarks[160], landmarks[158], 
        landmarks[133], landmarks[153], landmarks[144]
    ]);
    
    const rightEyeEAR = calculateEAR([
        landmarks[362], landmarks[385], landmarks[387], 
        landmarks[263], landmarks[373], landmarks[380]
    ]);
    
    const avgEAR = (leftEyeEAR + rightEyeEAR) / 2;
    
    // Mouth landmarks
    const mar = calculateMAR(landmarks);
    const mouthOpenness = getDistance(landmarks[13], landmarks[14]);
    const mouthWidth = getDistance(landmarks[61], landmarks[291]);
    
    // Eyebrow positions (for surprise)
    const leftEyebrowY = landmarks[70].y;
    const rightEyebrowY = landmarks[300].y;
    const avgEyebrowY = (leftEyebrowY + rightEyebrowY) / 2;
    const leftEyeY = landmarks[33].y;
    const rightEyeY = landmarks[362].y;
    const avgEyeY = (leftEyeY + rightEyeY) / 2;
    const eyebrowRaise = avgEyeY - avgEyebrowY;
    
    // Detect emotion based on thresholds
    let emotion = "Neutral 😐";
    let confidence = 0;
    
    // Happy: Wide smile, normal eyes
    if (mar > 0.30 && mouthWidth > 0.15) {
        emotion = "Happy 😊";
        confidence = Math.min(1.0, (mar - 0.25) * 4);
    }
    // Surprised: Wide open mouth + raised eyebrows
    else if (mar > 0.40 && eyebrowRaise > 0.015) {
        emotion = "Surprised 😮";
        confidence = Math.min(1.0, (mar - 0.35) * 3);
    }
    // Sad: Small mouth, droopy eyes
    else if (mar < 0.20 && avgEAR < 0.18) {
        emotion = "Sad 😔";
        confidence = Math.min(1.0, (0.22 - mar) * 5);
    }
    // Angry: Narrowed eyes, tight mouth
    else if (avgEAR < 0.15 && mar < 0.25 && mouthWidth < 0.12) {
        emotion = "Angry 😠";
        confidence = Math.min(1.0, (0.18 - avgEAR) * 6);
    }
    // Sleepy: Very closed eyes
    else if (avgEAR < 0.10) {
        emotion = "Sleepy 😴";
        confidence = Math.min(1.0, (0.12 - avgEAR) * 8);
    }
    // Neutral: Normal ranges
    else {
        emotion = "Neutral 😐";
        confidence = 0.8;
    }
    
    // Smooth emotion transitions
    emotionHistory.push({ emotion, confidence });
    if (emotionHistory.length > HISTORY_LENGTH) {
        emotionHistory.shift();
    }
    
    // Get most frequent emotion
    const emotionCounts = {};
    emotionHistory.forEach(e => {
        emotionCounts[e.emotion] = (emotionCounts[e.emotion] || 0) + 1;
    });
    
    let finalEmotion = emotion;
    let maxCount = 0;
    for (const [emote, count] of Object.entries(emotionCounts)) {
        if (count > maxCount) {
            maxCount = count;
            finalEmotion = emote;
        }
    }
    
    // Calculate average confidence
    const avgConfidence = emotionHistory.reduce((sum, e) => sum + e.confidence, 0) / emotionHistory.length;
    
    // Update display
    emotionElement.textContent = finalEmotion;
    confidenceElement.textContent = `Confidence: ${Math.round(avgConfidence * 100)}%`;
    
    // Draw landmarks if debug mode is on
    if (debugMode && window.drawConnectors) {
        ctx.save();
        if (faceMesh.options.selfieMode) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        
        // Draw face mesh
        drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {
            color: '#00FF0040',
            lineWidth: 1
        });
        
        // Draw eyes and lips
        drawConnectors(ctx, landmarks, FACEMESH_LEFT_EYE, {color: '#0066FF', lineWidth: 2});
        drawConnectors(ctx, landmarks, FACEMESH_RIGHT_EYE, {color: '#0066FF', lineWidth: 2});
        drawConnectors(ctx, landmarks, FACEMESH_LIPS, {color: '#FF0066', lineWidth: 2});
        
        ctx.restore();
    }
    
    // Continue processing
    if (cameraRunning) {
        requestAnimationFrame(() => {
            faceMesh.send({ image: video });
        });
    }
}

// Start camera
async function startCamera() {
    if (cameraRunning) return;
    
    try {
        statusElement.textContent = "Requesting camera access...";
        loadingElement.style.display = "block";
        
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user"
            },
            audio: false
        });
        
        video.srcObject = stream;
        cameraRunning = true;
        
        video.onloadedmetadata = () => {
            statusElement.textContent = "Camera ready! Detecting emotions...";
            loadingElement.style.display = "none";
            
            // Start face detection
            faceMesh.send({ image: video });
            
            // Update UI
            startBtn.style.display = "none";
            stopBtn.style.display = "inline-block";
        };
        
    } catch (error) {
        console.error("Camera error:", error);
        statusElement.textContent = `Camera error: ${error.message}`;
        statusElement.style.color = "#ff6b6b";
        emotionElement.textContent = "Camera access denied";
        loadingElement.style.display = "none";
        
        // Show fallback instructions
        emotionElement.innerHTML = "⚠️ Camera blocked<br>Please allow camera access to use emotion detection";
    }
}

// Stop camera
function stopCamera() {
    cameraRunning = false;
    
    if (video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Update UI
    startBtn.style.display = "inline-block";
    stopBtn.style.display = "none";
    emotionElement.textContent = "Camera stopped";
    confidenceElement.textContent = "";
}

// Toggle debug mode
function toggleDebug() {
    debugMode = !debugMode;
    const debugBtn = document.getElementById("debugBtn");
    debugBtn.textContent = debugMode ? "Hide Debug View" : "Show Debug View";
    debugBtn.style.background = debugMode ? 
        "linear-gradient(90deg, #ff9966 0%, #ff5e62 100%)" : 
        "linear-gradient(90deg, #00dbde 0%, #fc00ff 100%)";
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', init);

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden && cameraRunning) {
        // Pause processing when tab is not active
        cameraRunning = false;
    } else if (!document.hidden && video.srcObject) {
        // Resume when tab becomes active
        cameraRunning = true;
        faceMesh.send({ image: video });
    }
});

// Export for GitHub Pages compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { init, startCamera, stopCamera };
      }
