// --- Variables ---
let model = null;
let videoStream = null;
let totalPoints = 0;
const MAX_PROCESSING_WIDTH = 640; 

// --- DOM Elements ---
const statusBanner = document.getElementById('statusBanner');
const tabsContainer = document.getElementById('tabsContainer');
const tabCamera = document.getElementById('tabCamera');
const tabUpload = document.getElementById('tabUpload');

const viewCamera = document.getElementById('viewCamera');
const viewUpload = document.getElementById('viewUpload');
const viewResult = document.getElementById('viewResult');

const video = document.getElementById('webcam');
const btnCapture = document.getElementById('btnCapture');
const imageUpload = document.getElementById('imageUpload');

const canvas = document.getElementById('resultCanvas');
const ctx = canvas.getContext('2d');
const processingOverlay = document.getElementById('processingOverlay');
const resultText = document.getElementById('resultText');
const btnReset = document.getElementById('btnReset');
const totalPointsDisplay = document.getElementById('totalPointsDisplay');

// --- 1. Initialize System ---
window.onload = async () => {
    try {
        model = await cocoSsd.load();
        updateStatus("✅ ระบบ AI พร้อมใช้งาน", "bg-emerald-100", "text-emerald-700");
        tabsContainer.style.pointerEvents = "auto";
        tabsContainer.style.opacity = "1";
        
        // ตั้งค่าให้หน้าเริ่มต้นเป็นโหมดอัปโหลดเสมอ
        switchTab('upload');
    } catch (error) {
        console.error(error);
        updateStatus("❌ โหลด AI ไม่สำเร็จ กรุณารีเฟรช", "bg-red-100", "text-red-700");
    }
};

function updateStatus(msg, bgClass, textClass) {
    statusBanner.className = `${bgClass} ${textClass} text-sm font-medium py-2 px-4 rounded-full text-center mb-4 flex items-center justify-center shadow-sm`;
    statusBanner.innerHTML = msg;
}

// --- 2. Camera Management ---
async function startCamera() {
    try {
        if (videoStream) return;
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 } }, 
            audio: false
        });
        video.srcObject = stream;
        videoStream = stream;
    } catch (error) {
        console.error("Camera error:", error);
        updateStatus("⚠️ ไม่สามารถเปิดกล้องได้ กรุณาใช้โหมดอัปโหลด", "bg-yellow-100", "text-yellow-700");
        switchTab('upload');
    }
}

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
        video.srcObject = null;
    }
}

// --- 3. Tab Switching Logic ---
tabCamera.addEventListener('click', () => switchTab('camera'));
tabUpload.addEventListener('click', () => switchTab('upload'));

function switchTab(mode) {
    if (mode === 'camera') {
        tabCamera.className = "flex-1 py-3 text-center tab-active transition";
        tabUpload.className = "flex-1 py-3 text-center tab-inactive transition";
        viewCamera.classList.remove('hidden');
        viewUpload.classList.add('hidden');
        viewResult.classList.add('hidden');
        startCamera();
    } else {
        tabUpload.className = "flex-1 py-3 text-center tab-active transition";
        tabCamera.className = "flex-1 py-3 text-center tab-inactive transition";
        viewUpload.classList.remove('hidden');
        viewCamera.classList.add('hidden');
        viewResult.classList.add('hidden');
        stopCamera();
    }
    resultText.innerHTML = "";
}

// --- 4. Capture & Upload Actions ---
btnCapture.addEventListener('click', () => {
    if (!video.videoWidth) return;
    
    const scale = MAX_PROCESSING_WIDTH / video.videoWidth;
    canvas.width = MAX_PROCESSING_WIDTH;
    canvas.height = video.videoHeight * scale;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    stopCamera();
    showResultViewAndProcess();
});

imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            let scale = 1;
            if (img.width > MAX_PROCESSING_WIDTH) {
                scale = MAX_PROCESSING_WIDTH / img.width;
            }
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            showResultViewAndProcess();
        }
        img.src = event.target.result;
    }
    reader.readAsDataURL(file);
});

// --- 5. AI Processing & Scoring ---
async function showResultViewAndProcess() {
    viewCamera.classList.add('hidden');
    viewUpload.classList.add('hidden');
    viewResult.classList.remove('hidden');
    processingOverlay.classList.remove('hidden');
    resultText.innerHTML = "";

    setTimeout(async () => {
        await detectAndScore();
    }, 100);
}

async function detectAndScore() {
    if (!model) return;
    
    const predictions = await model.detect(canvas);
    processingOverlay.classList.add('hidden');
    
    let foundBottle = false;
    let currentImagePoints = 0;

    predictions.forEach(prediction => {
        if (prediction.class === 'bottle' && prediction.score > 0.25) {
            foundBottle = true;
            
            const [x, y, width, height] = prediction.bbox;
            
            let sizeLabel = "";
            let points = 0;
            let color = "";

            if (height <= 600) {
                sizeLabel = "300ml";
                points = 5;
                color = "#3b82f6"; 
            } else if (height <= 1000) {
                sizeLabel = "600ml";
                points = 10;
                color = "#10b981"; 
            } else {
                sizeLabel = "1500ml";
                points = 20;
                color = "#f59e0b"; 
            }

            currentImagePoints += points;

            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, width, height);

            const labelText = `${sizeLabel} (+${points} pts)`;
            ctx.font = "bold 18px Prompt, sans-serif";
            const textWidth = ctx.measureText(labelText).width;
            
            ctx.fillStyle = color;
            ctx.fillRect(x, y - 30, textWidth + 16, 30);

            ctx.fillStyle = "#ffffff";
            ctx.fillText(labelText, x + 8, y - 8);
            
            console.log(`Detected Bottle: Height = ${Math.round(height)}px, Size = ${sizeLabel}`);
        }
    });

    if (foundBottle) {
        totalPoints += currentImagePoints;
        animateValue(totalPointsDisplay, totalPoints - currentImagePoints, totalPoints, 1000);
        resultText.innerHTML = `🎉 ตรวจพบขวด! ได้รับ <span class="text-emerald-600">${currentImagePoints}</span> แต้ม`;
    } else {
        resultText.innerHTML = `❌ ไม่พบขวดพลาสติกในภาพ`;
    }
}

// --- 6. Helper Functions ---
btnReset.addEventListener('click', () => {
    if (tabCamera.classList.contains('tab-active')) {
        switchTab('camera');
    } else {
        switchTab('upload');
    }
    imageUpload.value = '';
});

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            // สร้าง ImageBitmap หรือรองรับการหมุนตาม EXIF อัตโนมัติ
            createImageBitmap(file, { imageOrientation: 'from-image' }).then((bitmap) => {
                let scale = 1;
                if (bitmap.width > MAX_PROCESSING_WIDTH) {
                    scale = MAX_PROCESSING_WIDTH / bitmap.width;
                }
                canvas.width = bitmap.width * scale;
                canvas.height = bitmap.height * scale;
                
                ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                showResultViewAndProcess();
            });
        }
        img.src = event.target.result;
    }
    reader.readAsDataURL(file);
});
