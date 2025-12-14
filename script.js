const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const countText = document.getElementById("count");

const faceDetection = new FaceDetection({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
});

faceDetection.setOptions({
  model: "short", // fast & mobile-friendly
  minDetectionConfidence: 0.5
});

faceDetection.onResults(results => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  let faces = 0;

  if (results.detections) {
    faces = results.detections.length;
    for (const detection of results.detections) {
      drawRectangle(ctx, detection.boundingBox, {
        color: "lime",
        lineWidth: 3
      });
    }
  }

  countText.innerText = faces;
});

const camera = new Camera(video, {
  onFrame: async () => {
    await faceDetection.send({ image: video });
  },
  width: 640,
  height: 480
});

camera.start();
