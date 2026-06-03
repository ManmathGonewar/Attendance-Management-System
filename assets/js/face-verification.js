/**
 * Face Verification Module
 * Handles face detection, capture, and verification flow
 */

class FaceVerificationModule {
    constructor() {
        this.videoElement = null;
        this.canvasElement = null;
        this.ctx = null;
        this.stream = null;
        this.detectionInterval = null;
        this.faceDetectionModel = null;
        this.faceRecognitionModel = null;
        this.faceLandmarksModel = null;
        this.currentFacingMode = 'user'; // front camera
        this.modelsLoaded = false;
        this.isCapturing = false;
        this.attemptCount = 0;
        this.maxAttempts = 3; // Must match backend FaceVerificationService::FACE_MAX_ATTEMPTS
        this.currentSessionId = null;
        this.currentStudentId = null;
        this.lastDetectionTime = 0;
        this.detectionStabilityFrames = 0;
        this.requiredStabilityFrames = 4; // reduced from 5 for faster response
        this.detectionThrottleMs = 80; // ~12 FPS for smooth mobile performance
        this.latitude = null;
        this.longitude = null;
        this.cachedDetection = null; // Cache last good detection for instant capture
        this.captureSampleCount = 3;
        this.captureMaxAttempts = 6;
        this.captureSampleDelayMs = 120;
        this.captureMinBrightness = 20;
        this.captureMaxBrightness = 240;
        this.captureMinSharpness = 4;
        this.acceptThreshold = 75;
        this.retryThreshold = 65;
        this.autoCaptureDelayMs = 600;
        this.autoCaptureTimer = null;
        this.autoVerifyEnabled = true;
        this.autoVerifyPaused = false;

        this.UI_STATES = {
            HIDDEN: 'hidden',
            WAITING_OTP: 'waiting_otp',
            OTP_VALIDATED: 'otp_validated',
            CAMERA_LOADING: 'camera_loading',
            CAMERA_READY: 'camera_ready',
            DETECTING: 'detecting',
            VERIFYING: 'verifying',
            SUCCESS: 'success',
            FAILED: 'failed',
            LOCKED: 'locked'
        };

        this.currentState = this.UI_STATES.HIDDEN;
        this.initializeUI();
    }

    /**
     * Initialize UI elements from the shared fullscreen overlay and session-specific components
     */
    initializeUI() {
        // Shared fullscreen overlay elements
        this.overlayEl = document.getElementById('camera-fullscreen-overlay');
        this.cameraTitleEl = document.getElementById('camera-fullscreen-title');
        this.cameraBodyEl = document.getElementById('camera-fullscreen-body');
        this.cameraFooterEl = document.getElementById('camera-fullscreen-footer');
        this.cameraCloseBtn = document.getElementById('camera-fullscreen-close-btn');

        // Session-specific elements (inside the stage)
        this.videoElement = document.getElementById('attendance-camera');
        this.cameraWrapEl = document.getElementById('attendance-camera-wrap');
        this.cameraErrorDiv = document.getElementById('attendance-camera-error');
        this.cameraErrorTitle = document.getElementById('camera-error-title');
        this.cameraErrorMessage = document.getElementById('camera-error-message');
        this.placeholderDiv = document.getElementById('attendance-placeholder');
        this.verifyBtn = document.getElementById('face-verify-btn');
        this.matchScoreEl = document.getElementById('match-score');
        this.statusEl = document.getElementById('attendance-status');
        this.resultAlertEl = document.getElementById('attendance-result');
        this.attemptsEl = document.getElementById('verification-attempts');
        this.verificationProgressEl = document.getElementById('verification-progress');
        this.verificationProgressBarEl = document.getElementById('verification-progress-bar');
        this.resultMatchScoreEl = document.getElementById('result-match-score');
        this.faceGuideOverlay = document.getElementById('face-guide-overlay');
        this.cameraHelpBtn = document.getElementById('camera-help-btn');
        this.retryBtn = document.getElementById('retry-attendance-camera-btn');
        
        // Mobile camera switch
        this.attendanceSwitchCameraBtn = document.getElementById('attendance-switch-camera-btn');

        // Bind events if elements exist
        if (this.verifyBtn) {
            this.verifyBtn.onclick = () => this.handleVerifyClick();
            this.verifyBtn.classList.add('d-none');
            this.verifyBtn.disabled = true;
            this.verifyBtn.setAttribute('aria-hidden', 'true');
        }
        if (this.cameraHelpBtn) {
            this.cameraHelpBtn.onclick = () => this.showCameraHelp();
        }
        if (this.retryBtn) {
            this.retryBtn.onclick = () => this.activateCamera();
        }
        if (this.attendanceSwitchCameraBtn) {
            this.attendanceSwitchCameraBtn.onclick = () => this.switchAttendanceCamera();
        }
        if (this.cameraCloseBtn) {
            this.cameraCloseBtn.onclick = () => this.stopAndClose();
        }
    }

    /**
     * Load face-api.js models
     */
    async loadModels() {
        if (this.modelsLoaded) return;

        try {
            // Reuse the same tiny face detector + landmark + recognition models
            // that the main app shell uses, for maximum compatibility.
            const MODEL_URL = 'assets/models';

            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
            ]);

            this.modelsLoaded = true;
            console.log('[FaceVerification] Models loaded: tinyFaceDetector, faceLandmark68Net, faceRecognitionNet');
        } catch (error) {
            console.error('[FaceVerification] Model load failed:', error);
            this.showError(
                'Model Loading Failed',
                'Could not load face recognition models. Please refresh the page.',
                'system_error'
            );
            throw error;
        }
    }

    /**
     * Start the verification process
     * @param {string} sessionId - The attendance session ID
     * @param {string} studentId - The student ID
     * @param {Object} options - Additional options (callbacks, etc.)
     */
    async startVerification(sessionId, studentId, options = {}) {
        this.currentSessionId = sessionId;
        this.currentStudentId = studentId;
        this.onSuccess = options.onSuccess || null;
        this.onFailure = options.onFailure || null;
        this.singleAttemptFlow = options.singleAttemptFlow === true;
        this.setVerificationConfig(options || {});
        this.attemptCount = 0;
        this.autoVerifyPaused = false;
        this.detectionStabilityFrames = 0;
        this.cachedDetection = null;
        this.lastDetectionTime = 0;
        if (this.matchScoreEl) {
            this.matchScoreEl.textContent = '--';
        }
        if (this.resultMatchScoreEl) {
            this.resultMatchScoreEl.textContent = '--';
        }
        if (this.resultAlertEl) {
            this.resultAlertEl.classList.add('d-none');
        }
        this.updateAttemptCounter();
        
        try {
            this.setState(this.UI_STATES.CAMERA_LOADING);
            await this.activateCamera();
        } catch (error) {
            console.error('Failed to start face verification:', error);
            if (this.onFailure) this.onFailure(error);
        }
    }

    /**
     * Request and activate camera
     */
    async activateCamera() {
        this.setState(this.UI_STATES.CAMERA_LOADING);
        this.hideError();

        try {
            // Ensure models are loaded
            if (!this.modelsLoaded) {
                await this.loadModels();
            }

            // Stop existing stream
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }

            // Move the entire camera surface so loading/error overlays remain visible in fullscreen.
            if (this.cameraBodyEl && this.cameraWrapEl) {
                if (!this.originalCameraWrapParent && this.cameraWrapEl.parentElement !== this.cameraBodyEl) {
                    this.originalCameraWrapParent = this.cameraWrapEl.parentElement;
                }
                
                if (this.verifyBtn) {
                    this.originalControlsParent = this.verifyBtn.closest('.attendance-camera-controls');
                }

                this.cameraBodyEl.innerHTML = '';
                this.cameraBodyEl.appendChild(this.cameraWrapEl);
                
                if (this.cameraFooterEl && this.originalControlsParent) {
                    this.cameraFooterEl.innerHTML = '';
                    this.cameraFooterEl.appendChild(this.originalControlsParent);
                    this.cameraFooterEl.classList.remove('d-none');
                }

                if (this.overlayEl) {
                    this.overlayEl.classList.remove('d-none');
                    document.body.classList.add('camera-fullscreen-lock');
                }
                if (this.cameraTitleEl) {
                    this.cameraTitleEl.textContent = 'Face Verification';
                }
            }

            this.prepareVideoElement();
            this.stream = await this.getCameraStreamWithFallback();
            this.videoElement.srcObject = this.stream;
            this.applyPreviewMirrorCorrection();
            await this.waitForVideoPlayback();

            this.setCameraSurfaceState('ready');
            this.setState(this.UI_STATES.DETECTING);
            this.startDetection();
        } catch (error) {
            this.handleCameraError(error);
        }
    }

    prepareVideoElement() {
        if (!this.videoElement) return;
        this.videoElement.muted = true;
        this.videoElement.autoplay = true;
        this.videoElement.playsInline = true;
        this.videoElement.setAttribute('muted', '');
        this.videoElement.setAttribute('autoplay', '');
        this.videoElement.setAttribute('playsinline', '');
        this.videoElement.setAttribute('webkit-playsinline', 'true');
    }

    async waitForVideoPlayback(timeoutMs = 4000) {
        if (!this.videoElement) return;

        const isReady = () => (
            this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            Number(this.videoElement.videoWidth || 0) > 0
        );

        const tryPlay = async () => {
            try {
                await this.videoElement.play();
            } catch (_) {
                // Muted camera previews usually auto-play; if a browser rejects play(),
                // keep waiting for a frame instead of failing immediately.
            }
        };

        if (isReady()) {
            await tryPlay();
            return;
        }

        await new Promise((resolve, reject) => {
            let settled = false;
            let timer = null;

            const cleanup = () => {
                if (timer) clearTimeout(timer);
                ['loadedmetadata', 'loadeddata', 'canplay', 'playing'].forEach((eventName) => {
                    this.videoElement.removeEventListener(eventName, onReady);
                });
            };

            const finish = (error = null) => {
                if (settled) return;
                settled = true;
                cleanup();
                if (error) reject(error);
                else resolve();
            };

            const onReady = async () => {
                await tryPlay();
                if (isReady()) finish();
            };

            ['loadedmetadata', 'loadeddata', 'canplay', 'playing'].forEach((eventName) => {
                this.videoElement.addEventListener(eventName, onReady);
            });

            timer = setTimeout(() => {
                if (isReady()) {
                    finish();
                    return;
                }
                finish(new Error('Camera preview did not load in time'));
            }, timeoutMs);

            void tryPlay().then(() => {
                if (isReady()) finish();
            });
        });
    }

    /**
     * Request camera stream with progressively relaxed constraints.
     */
    async getCameraStreamWithFallback() {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            const err = new Error('Camera API is not supported in this browser context');
            err.name = 'NotSupportedError';
            throw err;
        }

        const attempts = [
            {
                audio: false,
                video: {
                    facingMode: { ideal: this.currentFacingMode },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            },
            {
                audio: false,
                video: {
                    facingMode: { ideal: this.currentFacingMode },
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            },
            {
                audio: false,
                video: { facingMode: this.currentFacingMode }
            },
            {
                audio: false,
                video: true
            }
        ];

        let lastError = null;
        for (const constraints of attempts) {
            try {
                return await navigator.mediaDevices.getUserMedia(constraints);
            } catch (error) {
                lastError = error;
                // Permission/security errors are terminal: retries will fail too.
                if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError' || error?.name === 'SecurityError') {
                    throw error;
                }
            }
        }

        throw lastError || new Error('Unable to access camera');
    }


    /**
     * Ensure front-camera preview is not mirrored for user guidance.
     */
    applyPreviewMirrorCorrection() {
        if (!this.videoElement) return;
        let facingMode = String(this.currentFacingMode || '').toLowerCase();
        try {
            const track = this.stream?.getVideoTracks?.()[0] || null;
            const settingsFacing = String(track?.getSettings?.().facingMode || '').toLowerCase();
            if (settingsFacing !== '') {
                facingMode = settingsFacing;
            }
        } catch (_) {
            // Keep fallback facing mode.
        }
        const isFrontCamera = facingMode === 'user' || facingMode === 'face' || facingMode === '';
        this.videoElement.style.setProperty('transform', isFrontCamera ? 'scaleX(-1)' : 'none', 'important');
    }

    /**
     * Handle camera errors
     */
    handleCameraError(error) {
        console.error('Camera error:', error);

        let title = 'Camera Error';
        let message = 'Unable to access camera';
        let instructions = '';

        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            title = 'Camera Permission Denied';
            message = 'Please allow camera access to continue face verification';
            instructions = 'Check browser settings and ensure camera permission is granted.';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            title = 'No Camera Found';
            message = 'No camera detected on your device';
            instructions = 'Ensure your device has a working camera.';
        } else if (error.name === 'NotReadableError' || error.name === 'SecurityError') {
            title = 'Camera Not Accessible';
            message = 'Camera is being used by another application or blocked';
            instructions = 'Close other applications using the camera and try again.';
        } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
            title = 'Camera Constraints Not Supported';
            message = 'Requested camera settings are not supported on this device';
            instructions = 'Switch camera or retry; the app will automatically use lower settings next.';
        } else if (error.name === 'NotSupportedError' || error.name === 'TypeError') {
            title = 'Camera Not Supported';
            message = 'Your browser/environment does not allow camera access';
            instructions = 'Use HTTPS (or localhost), and a recent browser with camera support.';
        } else if (error.message === 'Camera preview did not load in time') {
            title = 'Camera Preview Stuck';
            message = 'Camera permission was granted, but the live preview did not start';
            instructions = 'Tap Retry, switch camera, or reload the page once.';
        }

        this.showError(title, message, 'camera_error', instructions);
    }

    /**
     * Start real-time face detection
     */
    startDetection() {
        if (!this.videoElement || !this.modelsLoaded) return;
        this._detecting = false;
        this._detectionRunning = true;
        this._lastRun = 0;

        const loop = async (timestamp) => {
            if (!this._detectionRunning) return;
            
            // Throttle detection to save CPU/Battery on mobile
            if (timestamp - this._lastRun >= this.detectionThrottleMs) {
                if (!this._detecting) {
                    this._detecting = true;
                    this._lastRun = timestamp;
                    await this.detectFace();
                    this._detecting = false;
                }
            }
            this.detectionInterval = requestAnimationFrame(loop);
        };
        this.detectionInterval = requestAnimationFrame(loop);
    }

    /**
     * Stop face detection
     */
    stopDetection() {
        this._detectionRunning = false;
        if (this.detectionInterval) {
            cancelAnimationFrame(this.detectionInterval);
            this.detectionInterval = null;
        }
        this.clearAutoCaptureTimer();
    }


    /**
     * Detect face using face-api
     * Optimized: Skip quality computation during live detection for performance
     */
    async detectFace() {
        if (!this.videoElement || !this.modelsLoaded) return;

        try {
            // Skip expensive quality computation during live detection
            // Only compute quality when capturing the final image
            let quality = null;

            const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
            const detections = await faceapi
                .detectSingleFace(this.videoElement, options);
                // landmarks and descriptors are only needed for capture, not for preview pulse

            if (detections) {
                this.handleFaceDetected(detections, quality);
            } else {
                this.handleNoFaceDetected();
            }
        } catch (error) {
            console.warn('[FaceVerification] Detection error:', error);
        }
    }

    /**
     * Compute brightness and sharpness of the current frame
     * Uses Laplacian variance method for blur detection
     */
    computeFrameQuality() {
        if (!this.videoElement || this.videoElement.paused || this.videoElement.ended) {
            return { brightness: 0, sharpness: 0, isBlurry: true };
        }

        if (!this.qualityCanvas) {
            this.qualityCanvas = document.createElement('canvas');
            this.qualityCtx = this.qualityCanvas.getContext('2d', { willReadFrequently: true });
        }
        if (!this.qualityCtx) return { brightness: 0, sharpness: 0, isBlurry: true };

        const width = 160;
        const height = 120;
        if (this.qualityCanvas.width !== width) {
            this.qualityCanvas.width = width;
            this.qualityCanvas.height = height;
        }

        this.qualityCtx.drawImage(this.videoElement, 0, 0, width, height);
        const imageData = this.qualityCtx.getImageData(0, 0, width, height);
        const frame = imageData.data;

        // Calculate brightness
        let brightnessSum = 0;
        for (let i = 0; i < frame.length; i += 4) {
            // standard luminance formula
            brightnessSum += (0.2126 * frame[i]) + (0.7152 * frame[i + 1]) + (0.0722 * frame[i + 2]);
        }
        
        const brightness = brightnessSum / (width * height);

        // Calculate blur using Laplacian variance method
        // Laplacian kernel: [0, 1, 0; 1, -4, 1; 0, 1, 0]
        const grayscale = new Uint8Array(width * height);
        let idx = 0;
        for (let i = 0; i < frame.length; i += 4) {
            grayscale[idx++] = frame[i]; // Using R channel as grayscale approximation
        }

        let laplacianSum = 0;
        let laplacianValues = [];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const center = grayscale[y * width + x];
                const top = grayscale[(y - 1) * width + x];
                const bottom = grayscale[(y + 1) * width + x];
                const left = grayscale[y * width + (x - 1)];
                const right = grayscale[y * width + (x + 1)];
                
                // Apply Laplacian kernel
                const laplacian = top + bottom + left + right - 4 * center;
                laplacianSum += laplacian;
                laplacianValues.push(laplacian);
            }
        }

        // Calculate variance of Laplacian
        const meanLaplacian = laplacianSum / laplacianValues.length;
        let varianceSum = 0;
        for (const val of laplacianValues) {
            varianceSum += Math.pow(val - meanLaplacian, 2);
        }
        const laplacianVariance = varianceSum / laplacianValues.length;
        
        // Sharpness is the Laplacian variance (higher = sharper)
        const sharpness = laplacianVariance;
        
        // Blur threshold - images with variance below this are considered blurry.
        // Slightly relaxed so mildly soft frames on mobile are still accepted.
        const BLUR_THRESHOLD = 60;
        const isBlurry = sharpness < BLUR_THRESHOLD;

        return {
            brightness: brightness,
            sharpness: sharpness,
            isBlurry: isBlurry
        };
    }

    /**
     * Handle face detected - cache the detection for instant capture
     */
    handleFaceDetected(detections, quality) {
        const detection = detections.detection ?? detections;

        // Check if face is properly positioned
        if (this.isFaceProperlyPositioned(detection)) {
            this.detectionStabilityFrames++;
            this.updateFaceGuide('good');
            this.enableVerifyButton();

            if (this.statusEl && this.currentState === this.UI_STATES.DETECTING) {
                const isStable = this.detectionStabilityFrames >= this.requiredStabilityFrames;
                this.statusEl.textContent = isStable
                    ? 'Hold steady...'
                    : 'Face detected';
                this.statusEl.className = `small mt-2 fw-semibold ${isStable ? 'text-success' : 'text-primary'}`;
            }

            if (this.currentState === this.UI_STATES.DETECTING && this.detectionStabilityFrames >= this.requiredStabilityFrames) {
                this.scheduleAutoCapture();
            }
        } else {
            this.detectionStabilityFrames = 0;
            this.clearAutoCaptureTimer();
            this.updateFaceGuide('poor');
            this.disableVerifyButton();
        }

        this.lastDetectionTime = Date.now();
    }

    /**
     * Handle no face detected
     */
    handleNoFaceDetected() {
        this.detectionStabilityFrames = 0;
        // Keep the last good detection briefly so a transient drop does not break capture.
        const cacheAge = this.lastDetectionTime ? (Date.now() - this.lastDetectionTime) : Infinity;
        if (cacheAge > 1500) {
            this.cachedDetection = null;
        }
        this.clearAutoCaptureTimer();
        this.updateFaceGuide('no_face');
        this.disableVerifyButton();
    }

    scheduleAutoCapture() {
        if (
            !this.autoVerifyEnabled ||
            this.autoVerifyPaused ||
            this.autoCaptureTimer ||
            this.currentState !== this.UI_STATES.DETECTING
        ) {
            return;
        }
        this.autoCaptureTimer = setTimeout(() => {
            this.autoCaptureTimer = null;
            if (this.currentState !== this.UI_STATES.DETECTING) {
                return;
            }
            if (this.detectionStabilityFrames < this.requiredStabilityFrames) {
                return;
            }
            const hasDescriptor = true; // We detect it during handleVerifyClick now
            if (hasDescriptor) {
                this.handleVerifyClick();
            }
        }, this.autoCaptureDelayMs);
    }

    clearAutoCaptureTimer() {
        if (this.autoCaptureTimer) {
            clearTimeout(this.autoCaptureTimer);
            this.autoCaptureTimer = null;
        }
    }

    /**
     * Check if face is properly positioned in frame
     */
    isFaceProperlyPositioned(detection) {
        if (!detection?.box || !this.videoElement) return false;
        const videoWidth = this.videoElement.videoWidth || 1;
        const videoHeight = this.videoElement.videoHeight || 1;
        const { x, y, width, height } = detection.box;

        // Face should be roughly centered
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        const videoCenterX = videoWidth / 2;
        const videoCenterY = videoHeight / 2;

        // Allow 30% tolerance from center (was 20%)
        const xTolerance = videoWidth * 0.3;
        const yTolerance = videoHeight * 0.3;

        const isCentered = Math.abs(centerX - videoCenterX) < xTolerance &&
            Math.abs(centerY - videoCenterY) < yTolerance;

        // Face should be sufficient size (at least 5% of video, was 9%)
        const minSize = (videoWidth * videoHeight) * 0.05;
        const isSufficientSize = (width * height) > minSize;

        // Face should not be too large (max 85% of video, was 64%)
        const maxSize = (videoWidth * videoHeight) * 0.85;
        const isNotTooLarge = (width * height) < maxSize;

        return isCentered && isSufficientSize && isNotTooLarge;
    }

    /**
     * Update face guide UI
     */
    updateFaceGuide(state) {
        const guideEl = this.faceGuideOverlay;
        if (!guideEl) return;

        let instructionText = '';
        guideEl.classList.remove('detected', 'not-detected');

        switch (state) {
            case 'good':
                instructionText = '✓ Perfect - Stay still';
                guideEl.classList.add('detected');
                break;
            case 'no_face':
                instructionText = 'No face detected';
                guideEl.classList.add('not-detected');
                break;
            case 'poor':
                instructionText = 'Center your face';
                guideEl.classList.add('not-detected');
                break;
            case 'blurry':
                instructionText = '⚠ Too blurry - Hold steady';
                guideEl.classList.add('not-detected');
                break;
        }

        const instructionEl = guideEl.querySelector('.face-guide-text');
        if (instructionEl) {
            instructionEl.textContent = instructionText;
        }
    }

    /**
     * Enable verify button
     */
    enableVerifyButton() {
        if (this.verifyBtn) {
            this.verifyBtn.classList.remove('d-none');
            this.verifyBtn.disabled = false;
            this.verifyBtn.setAttribute('aria-hidden', 'false');
        }
    }

    /**
     * Disable verify button
     */
    disableVerifyButton() {
        if (this.verifyBtn) {
            const keepVisible = this.currentState === this.UI_STATES.DETECTING;
            this.verifyBtn.classList.toggle('d-none', !keepVisible);
            this.verifyBtn.disabled = true;
            this.verifyBtn.setAttribute('aria-hidden', keepVisible ? 'false' : 'true');
        }
    }

    /**
     * Handle verify button click
     */
    async handleVerifyClick() {
        if (this.currentState === this.UI_STATES.VERIFYING) {
            return;
        }
        this.clearAutoCaptureTimer();
        this.setState(this.UI_STATES.VERIFYING);
        this.stopDetection();
        this.disableVerifyButton();
        const progressInterval = this.animateVerificationProgress();

        try {
            // Capture live embedding
            const liveEmbedding = await this.captureLiveEmbedding();
            if (!liveEmbedding) {
                throw new Error('Failed to capture face embedding');
            }

            // Send to backend for verification
            const result = await this.verifyWithBackend(liveEmbedding);
            clearInterval(progressInterval);
            this.verificationProgressBarEl.style.width = '100%';
            this.setVerificationConfig(result || {});

            const decisionRaw = String(result?.decision || '').toUpperCase();
            const matchScore = Number(result?.match_score ?? 0);
            // A score is present when the key exists in the response (even 0.0 is valid)
            const hasScore = 'match_score' in (result || {});
            const backendRemaining = this.syncAttemptsFromResult(result);
            const isScoredDecision = (decisionRaw === 'RETRY' || decisionRaw === 'REJECT' || decisionRaw === 'REJECTED');

            if (decisionRaw === 'ACCEPT') {
                this.handleVerificationSuccess(result);
                return;
            }

            if (decisionRaw === 'LOCKED') {
                this.handleVerificationLocked(result);
                return;
            }

            // Do not consume attempts on non-scored business errors
            // (e.g. face not registered, OTP not verified, invalid session).
            if (!isScoredDecision) {
                this.autoVerifyPaused = true;
                this.showResult('error', this.getResultMessage(result, 'Verification could not be completed.'));
                this.setState(this.UI_STATES.FAILED);
                return;
            }

            if (this.singleAttemptFlow) {
                this.handleVerificationAttemptFailure(result, backendRemaining);
                return;
            }

            // Fallback counter update when backend did not provide attempts_remaining.
            if (backendRemaining === null) {
                this.attemptCount = Math.min(this.maxAttempts, this.attemptCount + 1);
                this.updateAttemptCounter();
            }

            this.setState(this.UI_STATES.DETECTING);
            this.handleVerificationRetry(result, backendRemaining);
            this.startDetection();
        } catch (error) {
            console.error('Verification error:', error);
            this.showResult(
                'error',
                'Verification failed: ' + error.message
            );
            this.setState(this.UI_STATES.DETECTING);
            this.startDetection();
        }
    }

    handleVerificationAttemptFailure(result, backendRemaining = null) {
        const matchScore = Number(result?.match_score ?? 0);
        if (Number.isFinite(matchScore)) {
            this.updateMatchScore(matchScore);
        }

        const remaining = Number.isFinite(backendRemaining)
            ? Math.max(0, Number(backendRemaining))
            : Math.max(0, this.maxAttempts - Math.min(this.maxAttempts, this.attemptCount + 1));
        const decisionRaw = String(result?.decision || 'reject').toUpperCase();
        const thresholdHint = this.getThresholdHint(matchScore);
        const baseMessage = this.getResultMessage(result, 'Face does not match');
        const suffix = remaining > 0
            ? `Attempts left: ${remaining}/${this.maxAttempts}. Re-enter OTP to try again.`
            : 'Maximum attempts reached. Re-enter OTP when a new session is available.';
        const fullMessage = thresholdHint
            ? `${baseMessage} ${thresholdHint}. ${suffix}`
            : `${baseMessage} ${suffix}`;

        if (this.statusEl) {
            this.statusEl.textContent = remaining > 0 ? `Retry (${remaining} left)` : 'Locked';
            this.statusEl.className = `fw-bold fs-5 ${remaining > 0 ? 'text-warning' : 'text-danger'}`;
        }

        this.showResult(remaining > 0 ? 'warning' : 'error', fullMessage);
        this.setState(remaining > 0 ? this.UI_STATES.FAILED : this.UI_STATES.LOCKED);

        if (this.onFailure) {
            this.onFailure({
                type: remaining > 0 ? decisionRaw : 'LOCKED',
                message: fullMessage,
                attemptsRemaining: remaining,
                match_score: Number.isFinite(matchScore) ? matchScore : null,
                result
            });
        }
    }

    /**
     * Handle verification success
     */
    handleVerificationSuccess(result) {
        this.setState(this.UI_STATES.SUCCESS);
        const matchScore = result.match_score ?? 0;
        this.updateMatchScore(matchScore);
        console.log('[FaceVerification] Success, match_score:', matchScore, '%');
        
        if (this.statusEl) {
            this.statusEl.textContent = 'Verified ✓';
            this.statusEl.className = 'fw-bold fs-5 text-success';
        }

        this.showResult(
            'success',
            `Face verified with ${matchScore.toFixed(1)}% match. ${this.onSuccess ? 'Recording attendance...' : ''}`
        );

        if (this.onSuccess) {
            // app.js handles the final mark_attendance step via this callback
            this.onSuccess(result);
        } else {
            // Standalone fallback: close after delay
            setTimeout(() => this.stopAndClose(), 2000);
        }
    }

    /**
     * Handle verification failure/retry
     */
    handleVerificationRetry(result, backendRemaining = null) {
        const matchScore = result.match_score ?? 0;
        this.updateMatchScore(matchScore);
        console.log('[FaceVerification] Retry/reject, match_score:', matchScore, '%');

        const remaining = Number.isFinite(backendRemaining)
            ? Math.max(0, Number(backendRemaining))
            : Math.max(0, this.maxAttempts - this.attemptCount);
        const message = 'Face does not match';
        
        if (this.statusEl) {
            this.statusEl.textContent = `Retry (${remaining} left)`;
            this.statusEl.className = 'fw-bold fs-5 text-warning';
        }
        
        if (remaining > 0) {
            const thresholdHint = this.getThresholdHint(matchScore);
            const combined = thresholdHint ? `${message}. ${thresholdHint}. ${remaining} attempts left.` : `${message}. ${remaining} attempts left.`;
            this.showResult('warning', combined);
            this.enableVerifyButton();
        } else {
            this.handleVerificationLocked(result);
        }
    }

    /**
     * Handle final verification failure (locked)
     */
    handleVerificationLocked(result) {
        this.setState(this.UI_STATES.LOCKED);
        const matchScore = Number(result?.match_score);
        if (Number.isFinite(matchScore)) {
            this.updateMatchScore(matchScore);
        }
        const message = this.getResultMessage(result, 'Too many failed attempts. Attendance locked.');
        
        if (this.statusEl) {
            this.statusEl.textContent = 'Locked';
            this.statusEl.className = 'fw-bold fs-5 text-danger';
        }

        this.showResult('error', message);
        
        if (this.onFailure) {
            this.onFailure({
                type: 'LOCKED',
                message,
                match_score: Number.isFinite(matchScore) ? matchScore : null,
                result
            });
        }
    }


    /**
     * Capture live face embedding using multi-frame sampling.
     * Improves match reliability vs. single-frame instant capture.
     */
    async captureLiveEmbedding() {
        try {
            if (typeof window.detectStableFaceDescriptor === 'function') {
                const embedding = await window.detectStableFaceDescriptor(this.videoElement, this.captureSampleCount, {
                    detector: 'tiny',
                    inputSize: 224,
                    scoreThreshold: 0.35,
                    sampleDelayMs: this.captureSampleDelayMs,
                    minConfidence: 0.55,
                    minBrightness: this.captureMinBrightness,
                    maxBrightness: this.captureMaxBrightness,
                    minSharpness: this.captureMinSharpness,
                    allowLowQualityFallback: true
                });
                // detectStableFaceDescriptor may return Float32Array
                const normalized = this.normalizeEmbeddingVector(ArrayBuffer.isView(embedding) ? Array.from(embedding) : embedding);
                if (normalized && normalized.length === 128) {
                    console.log('[FaceVerification] Captured embedding via shared stable sampler');
                    return normalized;
                }
            }

            const samples = [];
            let attempts = 0;
            const options = new faceapi.TinyFaceDetectorOptions({
                inputSize: 224,
                scoreThreshold: 0.3
            });

            // Prefer the freshest descriptor from live detection for instant capture.
            const cacheAge = this.lastDetectionTime ? (Date.now() - this.lastDetectionTime) : Infinity;
            const cachedDescriptor = this.cachedDetection?.descriptor;
            const hasCachedDescriptor = cachedDescriptor && cachedDescriptor.length === 128;
            if (hasCachedDescriptor && cacheAge < 1500) {
                samples.push(Array.from(cachedDescriptor));
                console.log('[FaceVerification] Using fresh cached descriptor for capture (age:', cacheAge, 'ms)');
            }

            while (samples.length < this.captureSampleCount && attempts < this.captureMaxAttempts) {
                attempts += 1;
                const detection = await faceapi
                    .detectSingleFace(this.videoElement, options)
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                if (detection?.descriptor && detection.descriptor.length === 128) {
                    const descriptor = Array.from(detection.descriptor);
                    const isDuplicate = samples.some((vec) => this.embeddingDistance(vec, descriptor) < 0.02);
                    if (!isDuplicate) {
                        samples.push(descriptor);
                    }
                }

                if (samples.length < this.captureSampleCount) {
                    await new Promise((resolve) => setTimeout(resolve, this.captureSampleDelayMs));
                }
            }

            // Best-effort fallback: use cached descriptor even when it is a bit older.
            if (!samples.length) {
                const fallbackDescriptor = this.cachedDetection?.descriptor;
                const fallbackUsable = fallbackDescriptor && fallbackDescriptor.length === 128;
                if (fallbackUsable) {
                    samples.push(Array.from(fallbackDescriptor));
                    console.warn('[FaceVerification] Falling back to cached descriptor after detection retries');
                }
            }

            if (!samples.length) {
                console.warn('[FaceVerification] No valid detection/descriptor at capture');
                return null;
            }

            const averaged = samples.length === 1 ? samples[0] : this.averageEmbeddings(samples);
            const embedding = this.normalizeEmbeddingVector(averaged);
            console.log('[FaceVerification] Embedding length:', embedding?.length, '(expected 128), samples:', samples.length);
            if (!embedding || embedding.length !== 128) {
                console.error('[FaceVerification] Invalid embedding length after averaging/normalization:', embedding?.length);
                return null;
            }
            return embedding;
        } catch (error) {
            console.error('Failed to capture embedding:', error);
            return null;
        }
    }

    embeddingDistance(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
            return Infinity;
        }
        let sum = 0;
        for (let i = 0; i < a.length; i += 1) {
            const diff = Number(a[i] || 0) - Number(b[i] || 0);
            sum += (diff * diff);
        }
        return Math.sqrt(sum);
    }

    isFrameQualityAcceptable(quality) {
        if (!quality) return false;
        const brightness = Number(quality.brightness);
        const sharpness = Number(quality.sharpness);
        if (!Number.isFinite(brightness) || !Number.isFinite(sharpness)) {
            return false;
        }
        if (brightness < this.captureMinBrightness || brightness > this.captureMaxBrightness) {
            return false;
        }
        return sharpness >= this.captureMinSharpness;
    }

    averageEmbeddings(embeddings) {
        if (!Array.isArray(embeddings) || embeddings.length === 0) return [];
        const dim = embeddings[0]?.length || 0;
        if (dim === 0) return [];
        const avg = new Array(dim).fill(0);
        let validCount = 0;
        for (const vec of embeddings) {
            if (!Array.isArray(vec) || vec.length !== dim) continue;
            validCount += 1;
            for (let i = 0; i < dim; i += 1) {
                avg[i] += Number(vec[i] || 0);
            }
        }
        if (validCount === 0) return [];
        for (let i = 0; i < dim; i += 1) {
            avg[i] /= validCount;
        }
        return avg;
    }

    normalizeEmbeddingVector(vector) {
        // Accept Float32Array / typed arrays from face-api.js helpers
        if (ArrayBuffer.isView(vector)) {
            vector = Array.from(vector);
        }
        if (!Array.isArray(vector) || vector.length !== 128) return null;
        let normSq = 0;
        for (let i = 0; i < vector.length; i += 1) {
            const v = Number(vector[i] || 0);
            normSq += (v * v);
        }
        const norm = Math.sqrt(normSq);
        if (!Number.isFinite(norm) || norm <= 0) return null;
        const normalized = new Array(vector.length);
        for (let i = 0; i < vector.length; i += 1) {
            normalized[i] = Number(vector[i] || 0) / norm;
        }
        return normalized;
    }

    /**
     * Send embedding to backend for verification
     */
    async verifyWithBackend(embedding) {
        try {
            const payload = {
                session_id: this.currentSessionId,
                live_embedding: embedding
            };
            console.log('[FaceVerification] Sending verify_face, session_id:', payload.session_id, 'embedding_len:', payload.live_embedding?.length);

            const response = await apiRequest('verify_face', 'POST', payload);

            console.log('[FaceVerification] Response:', response?.decision, 'match_score:', response?.match_score, 'success:', response?.success);
            return response;
        } catch (error) {
            console.error('Backend verification error:', error);
            if (error.details) {
                return error.details; // Return the details so handleVerifyClick can process retry/reject/locked!
            }
            throw error;
        }
    }


    /**
     * Update match score display
     */
    updateMatchScore(score) {
        const n = Number(score);
        const text = (Number.isFinite(n) ? n : 0).toFixed(1) + '%';
        const els = [this.matchScoreEl, this.resultMatchScoreEl].filter(Boolean);
        
        els.forEach(el => {
            el.textContent = text;
            el.style.animation = 'none';
            void el.offsetHeight; // trigger reflow
            el.style.animation = 'scorePop 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
            
            // Color based on score range
            if (n >= 75) {
                el.classList.remove('text-warning', 'text-danger');
                el.classList.add('text-success');
            } else if (n >= 45) {
                el.classList.remove('text-success', 'text-danger');
                el.classList.add('text-warning');
            } else {
                el.classList.remove('text-success', 'text-warning');
                el.classList.add('text-danger');
            }
        });
    }

    /**
     * Update attempt counter display
     */
    updateAttemptCounter() {
        if (this.attemptsEl) {
            const usedAttempts = Math.max(0, Math.min(this.maxAttempts, this.attemptCount));
            const remaining = this.maxAttempts - usedAttempts;
            const nextAttempt = Math.min(this.maxAttempts, usedAttempts + 1);
            this.attemptsEl.textContent = `Attempt ${nextAttempt}/${this.maxAttempts}`;
            if (remaining <= 1) {
                this.attemptsEl.className = 'badge bg-danger';
            } else if (remaining <= 2) {
                this.attemptsEl.className = 'badge bg-warning';
            } else {
                this.attemptsEl.className = 'badge bg-secondary';
            }
        }
    }

    /**
     * Prefer backend-provided attempts_remaining to keep UI and server in sync.
     */
    syncAttemptsFromResult(result) {
        const raw = Number(result?.attempts_remaining);
        if (!Number.isFinite(raw)) {
            return null;
        }
        const remaining = Math.max(0, Math.min(this.maxAttempts, Math.floor(raw)));
        this.attemptCount = Math.max(0, this.maxAttempts - remaining);
        this.updateAttemptCounter();
        return remaining;
    }

    setVerificationConfig(config) {
        if (!config || typeof config !== 'object') return;
        const nextMaxAttempts = Number(config.max_attempts);
        if (Number.isFinite(nextMaxAttempts) && nextMaxAttempts >= 1) {
            this.maxAttempts = Math.max(1, Math.floor(nextMaxAttempts));
        }
        const nextAccept = Number(config.accept_threshold);
        if (Number.isFinite(nextAccept) && nextAccept > 0 && nextAccept <= 100) {
            this.acceptThreshold = nextAccept;
        }
        const nextRetry = Number(config.retry_threshold);
        if (Number.isFinite(nextRetry) && nextRetry >= 0 && nextRetry < this.acceptThreshold) {
            this.retryThreshold = nextRetry;
        }
    }

    /**
     * Animate verification progress bar
     */
    animateVerificationProgress() {
        if (!this.verificationProgressBarEl) return;
        let progress = 0;
        // Ultra-smooth: smaller increments + faster interval + CSS cubic-bezier = Silky
        const interval = setInterval(() => {
            if (progress < 40) {
                progress += Math.random() * 2.5 + 1.5;
            } else if (progress < 70) {
                progress += Math.random() * 1.8 + 1;
            } else if (progress < 88) {
                progress += Math.random() * 0.8 + 0.3;
            } else if (progress < 96) {
                progress += 0.15;
            }
            
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
            }
            this.verificationProgressBarEl.style.width = progress + '%';
        }, 80);
        return interval;
    }

    getThresholdHint(score) {
        const n = Number(score);
        if (!Number.isFinite(n)) return '';
        if (n >= this.acceptThreshold) {
            return `Required ${this.acceptThreshold.toFixed(0)}%+`;
        }
        if (n >= this.retryThreshold) {
            return `Need ${Math.max(0, this.acceptThreshold - n).toFixed(1)}% more for approval`;
        }
        return `Required ${this.retryThreshold.toFixed(0)}%+ for retry, ${this.acceptThreshold.toFixed(0)}%+ for approval`;
    }

    /**
     * Normalize API message field differences between success and error responses.
     */
    getResultMessage(result, fallback) {
        const msg = String(result?.message || result?.error || '').trim();
        return msg !== '' ? msg : fallback;
    }

    /**
     * Show result alert
     */
    showResult(type, message) {
        if (!this.resultAlertEl) return;

        this.resultAlertEl.className = `alert small d-none alert-${type === 'error' ? 'danger' : type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'info'}`;
        this.resultAlertEl.textContent = message;
        this.resultAlertEl.classList.remove('d-none');
    }

    /**
     * Show camera error
     */
    showError(title, message, type = 'error', instructions = '') {
        if (this.cameraErrorDiv) {
            if (this.cameraErrorTitle) this.cameraErrorTitle.textContent = title;
            if (this.cameraErrorMessage) this.cameraErrorMessage.textContent = message;

            const instructionsEl = document.getElementById('camera-error-instructions');
            if (instructionsEl) {
                instructionsEl.textContent = instructions;
            }

            this.setCameraSurfaceState('error');
        }

        this.setState(this.UI_STATES.FAILED);
    }

    /**
     * Hide camera error
     */
    hideError() {
        const instructionsEl = document.getElementById('camera-error-instructions');
        if (instructionsEl) {
            instructionsEl.textContent = '';
        }
        this.setCameraSurfaceState('loading');
    }

    setCameraSurfaceState(mode) {
        if (this.videoElement) {
            this.videoElement.classList.toggle('d-none', mode !== 'ready');
        }
        if (this.placeholderDiv) {
            this.placeholderDiv.classList.toggle('d-none', mode !== 'loading');
        }
        if (this.cameraErrorDiv) {
            this.cameraErrorDiv.classList.toggle('d-none', mode !== 'error');
        }
    }

    /**
     * Show camera help modal
     */
    showCameraHelp() {
        const helpContent = `
            <div class="modal fade" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Camera Setup Help</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body small">
                            <h6>To enable camera access:</h6>
                            <ol class="mb-3">
                                <li><strong>Chrome/Edge:</strong> Click the camera icon in the address bar → Allow</li>
                                <li><strong>Firefox:</strong> Click the camera icon in the address bar → Allow</li>
                                <li><strong>Safari:</strong> Settings → Websites → Camera → Allow</li>
                                <li><strong>Mobile:</strong> Tap the lock icon → Camera → Allow</li>
                            </ol>
                            <h6>Tips for best results:</h6>
                            <ul>
                                <li>Good lighting (natural light preferred)</li>
                                <li>Clear face without obstructions</li>
                                <li>Centered in the camera frame</li>
                                <li>Remove glasses if possible</li>
                                <li>Neutral expression</li>
                            </ul>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const temp = document.createElement('div');
        temp.innerHTML = helpContent;
        const modal = temp.querySelector('.modal');
        document.body.appendChild(modal);

        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();

        modal.addEventListener('hidden.bs.modal', () => {
            document.body.removeChild(modal);
        });
    }

    /**
     * Set UI state
     */
    setState(newState) {
        this.currentState = newState;
        console.log(`[FaceVerification] State: ${newState}`);

        // Handle overlay visibility
        const isHidden = newState === this.UI_STATES.HIDDEN;
        if (this.overlayEl) {
            if (isHidden) {
                this.overlayEl.classList.add('d-none');
                document.body.classList.remove('camera-fullscreen-lock');
            } else {
                this.overlayEl.classList.remove('d-none');
                document.body.classList.add('camera-fullscreen-lock');
            }
        }

        // Guide overlay logic
        if (this.faceGuideOverlay) {
            if (newState === this.UI_STATES.DETECTING) {
                this.faceGuideOverlay.classList.remove('d-none');
            } else {
                this.faceGuideOverlay.classList.add('d-none');
            }
        }

        // Progress/Button logic
        if (this.verificationProgressEl) {
            if (newState === this.UI_STATES.VERIFYING) {
                this.verificationProgressEl.classList.remove('d-none');
            } else {
                this.verificationProgressEl.classList.add('d-none');
            }
        }

        if (this.verifyBtn) {
            const showManualVerify = newState === this.UI_STATES.DETECTING;
            this.verifyBtn.classList.toggle('d-none', !showManualVerify);
            this.verifyBtn.setAttribute('aria-hidden', showManualVerify ? 'false' : 'true');
            this.verifyBtn.disabled = true;
        }
    }

    /**
     * Stop camera and close overlay
     */
    stopAndClose() {
        this.clearAutoCaptureTimer();
        this.setState(this.UI_STATES.HIDDEN);
        this.stopDetection();
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
        this.setCameraSurfaceState('loading');
        
        if (this.cameraWrapEl && this.originalCameraWrapParent) {
            this.originalCameraWrapParent.appendChild(this.cameraWrapEl);
        }

        if (this.originalControlsParent && this.cameraFooterEl) {
            const footerControls = this.cameraFooterEl.querySelector('.attendance-camera-controls');
            if (footerControls) {
                const cameraWrap = document.getElementById('attendance-camera-wrap');
                if (cameraWrap && cameraWrap.nextSibling) {
                    cameraWrap.parentNode.insertBefore(footerControls, cameraWrap.nextSibling);
                } else if (cameraWrap) {
                    cameraWrap.parentNode.appendChild(footerControls);
                }
            }
            this.cameraFooterEl.classList.add('d-none');
            this.cameraFooterEl.innerHTML = '';
        }
    }


    /**
     * Switch camera (user/environment)
     */
    async switchAttendanceCamera() {
        this.autoVerifyPaused = false;
        this.clearAutoCaptureTimer();
        this.detectionStabilityFrames = 0;
        this.cachedDetection = null;
        this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
        await this.activateCamera();
    }


    /**
     * Cleanup
     */
    destroy() {
        this.clearAutoCaptureTimer();
        this.stopDetection();
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
    }
}

// Expose class to window
window.FaceVerificationModule = FaceVerificationModule;

// Global instance
window.faceVerificationModule = null;

/**
 * Initialize face verification module
 */
window.initFaceVerificationModule = function() {
    if (!window.faceVerificationModule) {
        window.faceVerificationModule = new FaceVerificationModule();
    }
    return window.faceVerificationModule;
};

// Auto-initialize if the script is loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.initFaceVerificationModule();
} else {
    document.addEventListener('DOMContentLoaded', () => {
        window.initFaceVerificationModule();
    });
}
