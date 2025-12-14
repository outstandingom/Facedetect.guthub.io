const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const emotionText = document.getElementById("emotion");

const faceMesh = new FaceMesh({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults(results => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  if (!results.multiFaceLandmarks) {
    emotionText.innerText = "No face";
    return;
  }

  const landmarks = results.multiFaceLandmarks[0];

  // Key landmarks
  const mouthTop = landmarks[13];
  const mouthBottom = landmarks[14];
  const leftMouth = landmarks[61];
  const rightMouth = landmarks[291];

  const leftEyeTop = landmarks[159];
  const leftEyeBottom = landmarks[145];

  // Distances (normalized)
  const mouthOpen = Math.abs(mouthTop.y - mouthBottom.y);
  const mouthWidth = Math.abs(leftMouth.x - rightMouth.x);
  const eyeOpen = Math.abs(leftEyeTop.y - leftEyeBottom.y);

  let emotion = "Neutral";

  if (mouthOpen > 0.05 && mouthWidth > 0.08) {
    emotion = "Happy 😊";
  } else if (mouthOpen > 0.08) {
    emotion = "Surprised 😮";
  } else if (eyeOpen < 0.01) {
    emotion = "Sleepy / Sad 😔";
  }

  emotionText.innerText = emotion;

  // Draw landmarks (optional)
  drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {
    color: "#00FF00",
    lineWidth: 0.5
  });
});

const camera = new Camera(video, {
  onFrame: async () => {
    await faceMesh.send({ image: video });
  },
  width: 640,
  height: 480
});

camera.start();
