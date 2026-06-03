/**
 * Face Registration Module
 * Handles multi-sample face enrollment with quality validation and alignment UI
 * Captures 4 facial samples (2x front, right, left) and generates descriptors
 */

class FaceRegistrationModule {
    constructor() {
        this.videoElement = null;
        this.canvasElement = null;
        this.ctx = null;
        this.stream = null;
        this.detectionInterval = null;
        this.modelsLoaded = false;
        this.isRegistering = false;
        this.currentFacingMode = 'user';
        this.cachedDetection = null;
        this.lastDetectionTime = 0;
        this.defaultCaptureBtnHtml = '';
        
        // Registration state
        this.samples = {
            front_1: null,
            front_2: null,
            right: null,
            left: null
        };
        this.sampleDescriptors = {};
        this.currentSampleIndex = 0;
        this.sampleSequence = ['front_1', 'front_2', 'right', 'left'];
        this.detectionThrottleMs = 80; // ~12 FPS
        this._lastRun = 0;
        
        // Quality validation thresholds
        this.BLUR_THRESHOLD = 60;
        this.MIN_BRIGHTNESS = 40;
        this.MAX_BRIGHTNESS = 240;
        this.MIN_FACE_SIZE = 0.05; // 5% of video area
        this.MAX_FACE_SIZE = 0.85; // 85% of video area
        
        // Stability tracking
        this.detectionStabilityFrames = 0;
        this.requiredStabilityFrames = 2; // slightly more than 1 to avoid flickering, but fast
        
        // Facial alignment requirements for each sample
        this.angleRequirements = {
            front: { minYaw: -15, maxYaw: 15, minRoll: -20, maxRoll: 20 },
            left: { minYaw: -50, maxYaw: -15 },
            right: { minYaw: 15, maxYaw: 50 }
        };
        
        this.UI_STATES = {
            HIDDEN: 'hidden',
            PREPARING: 'preparing',
            CAMERA_LOADING: 'camera_loading',
            CAMERA_READY: 'camera_ready',
            DETECTING: 'detecting',
            CAPTURING: 'capturing',
            PROCESSING: 'processing',
            SUCCESS: 'success',
            FAILED: 'failed'
        };
        
        this.currentState = this.UI_STATES.HIDDEN;
        this.initializeUI();
    }

    /**
     * Initialize UI elements
     */
    initializeUI() {
        this.videoElement = document.getElementById('registration-camera');
        this.alignmentOverlay = document.getElementById('registration-face-guide-overlay');
        this.progressEl = document.getElementById('registration-progress');
        this.sampleCountEl = document.getElementById('capture-progress');
        this.instructionEl = document.getElementById('capture-guidance');
        this.guideTextEl = document.getElementById('registration-face-guide-text');
        this.captureBtn = document.getElementById('registration-capture-btn');
        this.cancelBtn = document.getElementById('registration-cancel-btn');
        this.statusEl = document.getElementById('registration-status');
        this.resultAlertEl = document.getElementById('registration-result');
        this.cameraTitleEl = document.getElementById('camera-fullscreen-title');
        this.cameraBodyEl = document.getElementById('camera-fullscreen-body');
        this.cameraFooterEl = document.getElementById('camera-fullscreen-footer');
        this.cameraCloseBtn = document.getElementById('camera-fullscreen-close-btn');
        if (this.captureBtn && !this.defaultCaptureBtnHtml) {
            this.defaultCaptureBtnHtml = this.captureBtn.innerHTML;
        }
        
        // Bind events (once)
        if (!this._eventsBound) {
            if (this.captureBtn) {
                this.captureBtn.addEventListener('click', () => this.captureSample());
            }
            if (this.cancelBtn) {
                this.cancelBtn.addEventListener('click', () => this.cancelRegistration());
            }
            if (this.cameraCloseBtn) {
                this.cameraCloseBtn.addEventListener('click', () => this.cancelRegistration());
            }
            this._eventsBound = true;
        }
    }

    /**
     * Load face-api.js models
     */
    async loadModels() {
        if (this.modelsLoaded) return;
        try {
            const MODEL_URL = 'assets/models';
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
            ]);
            this.modelsLoaded = true;
        } catch (error) {
            console.error('Failed to load face-api models:', error);
            this.showError('Model Loading Failed', 'Could not load face recognition models.');
            throw error;
        }
    }

    /**
     * Start face registration flow
     */
    async startRegistration() {
        try {
            this.initializeUI();
            this.resetSamples();
            this.hideResult();
            this.setState(this.UI_STATES.CAMERA_LOADING);
            const modelLoadPromise = this.loadModels();
            await this.activateCamera(false);
            await modelLoadPromise;
            this.setState(this.UI_STATES.DETECTING);
            this.startDetection();
        } catch (error) {
            console.error('Failed to start registration:', error);
            this.stopCamera();
            this.showError('Registration Failed', error.message || 'Failed to start registration');
        }
    }

    /**
     * Activate camera
     */
    async activateCamera(startDetection = true) {
        try {
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }

            this.prepareVideoElement();
            this.stream = await this.getCameraStreamWithFallback();
            this.videoElement.srcObject = this.stream;
            this.applyPreviewMirrorCorrection();
            await this.waitForVideoPlayback();

            if (startDetection) {
                this.setState(this.UI_STATES.DETECTING);
                this.startDetection();
            }
        } catch (error) {
            this.handleCameraError(error);
            throw error;
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
                // Keep waiting for the stream frame if the browser delays auto-play.
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

    async getCameraStreamWithFallback() {
        if (!window.isSecureContext) {
            throw new Error('Camera access requires HTTPS or localhost');
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('Camera API not supported');
        }

        const attempts = [
            { video: { facingMode: { ideal: this.currentFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } } },
            { video: { facingMode: { ideal: this.currentFacingMode }, width: { ideal: 640 }, height: { ideal: 480 } } },
            { video: { facingMode: this.currentFacingMode } },
            { video: true }
        ];

        let lastError = null;
        for (const constraints of attempts) {
            try { return await navigator.mediaDevices.getUserMedia(constraints); }
            catch (e) { lastError = e; if (e.name === 'NotAllowedError') throw e; }
        }
        throw lastError;
    }

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
        const transformValue = isFrontCamera ? 'scaleX(-1)' : 'none';
        // Force the correction because fullscreen CSS also sets transform.
        this.videoElement.style.setProperty('transform', transformValue, 'important');
        this.videoElement.style.setProperty('-webkit-transform', transformValue, 'important');
    }

    handleCameraError(error) {
        let message = 'Unable to access camera';
        if (error.name === 'NotAllowedError') message = 'Camera permission denied.';
        else if (error.name === 'NotFoundError') message = 'No camera found.';
        else if (error.name === 'NotReadableError' || error.name === 'SecurityError') message = 'Camera is busy or blocked by another app.';
        else if (error.message === 'Camera access requires HTTPS or localhost') message = 'Camera access works only on HTTPS or localhost.';
        else if (error.message === 'Camera preview did not load in time') message = 'Camera permission was granted, but preview did not start. Please retry.';
        this.showError('Camera Error', message);
    }

    startDetection() {
        if (!this.videoElement || !this.modelsLoaded) return;
        this._detecting = false;
        this._detectionRunning = true;
        this._lastRun = 0;

        const loop = async (timestamp) => {
            if (!this._detectionRunning) return;
            
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

    stopDetection() {
        this._detectionRunning = false;
        if (this.detectionInterval) cancelAnimationFrame(this.detectionInterval);
    }

    async detectFace() {
        if (this.currentState === this.UI_STATES.CAPTURING || this.currentState === this.UI_STATES.PROCESSING) return;
        try {
            const quality = this.computeFrameQuality();
            const currentSample = this.sampleSequence[this.currentSampleIndex];
            if (!currentSample) return; // Registration complete
            const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
            const detections = await faceapi.detectSingleFace(this.videoElement, options).withFaceLandmarks();
            // No descriptor needed for preview pulse, save time.
            if (detections) {
                this.handleFaceDetected(detections, quality, currentSample);
            } else {
                this.handleNoFaceDetected();
            }
        } catch (e) {
            console.warn('[FaceRegistration] Detection error:', e);
            this.handleNoFaceDetected();
        }
    }

    computeFrameQuality() {
        if (!this.videoElement || this.videoElement.paused) return { brightness: 128, isBlurry: false };
        if (!this.qualityCanvas) {
            this.qualityCanvas = document.createElement('canvas');
            this.qualityCtx = this.qualityCanvas.getContext('2d', { willReadFrequently: true });
            this.qualityCanvas.width = 80;
            this.qualityCanvas.height = 60;
        }
        this.qualityCtx.drawImage(this.videoElement, 0, 0, 80, 60);
        const frame = this.qualityCtx.getImageData(0, 0, 80, 60).data;
        let brightnessSum = 0, n = 0;
        for (let i = 0; i < frame.length; i += 16) {
            brightnessSum += (0.2126 * frame[i]) + (0.7152 * frame[i + 1]) + (0.0722 * frame[i + 2]);
            n++;
        }
        const brightness = brightnessSum / n;
        let sum = 0, sumSq = 0, ln = 0;
        for (let i = 84; i < frame.length - 84; i += 16) {
            const lap = frame[i-4] + frame[i+4] + frame[i-320] + frame[i+320] - 4*frame[i];
            sum += lap; sumSq += lap*lap; ln++;
        }
        const variance = (sumSq/ln) - (sum/ln)*(sum/ln);
        return { brightness, isBlurry: variance < this.BLUR_THRESHOLD };
    }

    handleFaceDetected(detections, quality, currentSample) {
        const { detection, landmarks } = detections;
        const isLightingGood = quality.brightness > this.MIN_BRIGHTNESS && quality.brightness < this.MAX_BRIGHTNESS;
        const { isCentered, isSufficientSize, isNotTooLarge, isCorrectAngle } = this.validateFacePosition(detection, landmarks, currentSample);

        let guidance = 'good';
        if (!isCentered) guidance = 'center';
        else if (quality.isBlurry) guidance = 'blurry';
        else if (isLightingGood === false) guidance = (quality.brightness < this.MIN_BRIGHTNESS) ? 'low_light' : 'too_bright';
        else if (!isSufficientSize) guidance = 'too_small';
        else if (!isNotTooLarge) guidance = 'too_large';
        else if (!isCorrectAngle) guidance = 'wrong_angle';

        const isGoodState = (guidance === 'good');
        this.updateAlignmentGuide(guidance, currentSample);

        if (this.statusEl) {
            const isStable = this.detectionStabilityFrames >= this.requiredStabilityFrames;
            this.statusEl.textContent = isGoodState ? (isStable ? 'Hold steady...' : 'Perfect - keep still') : 'Position face...';
            this.statusEl.className = `small mt-2 fw-semibold ${isGoodState ? (isStable ? 'text-success' : 'text-primary') : 'text-danger'}`;
        }

        if (isGoodState) {
            this.detectionStabilityFrames++;
        } else {
            this.detectionStabilityFrames = 0;
        }

        if (this.detectionStabilityFrames >= this.requiredStabilityFrames) {
            this.enableCaptureButton();
        } else {
            this.disableCaptureButton();
        }

        this.lastDetectionTime = Date.now();
    }

    handleNoFaceDetected() {
        this.detectionStabilityFrames = 0;
        const cacheAge = this.lastDetectionTime ? (Date.now() - this.lastDetectionTime) : Infinity;
        if (cacheAge > 1500) {
            this.cachedDetection = null;
            this.lastDescriptor = null;
        }
        this.updateAlignmentGuide('no_face', this.sampleSequence[this.currentSampleIndex]);
        this.disableCaptureButton();
    }

    validateFacePosition(detection, landmarks, sampleType) {
        if (!sampleType) return { isCentered: false, isSufficientSize: false, isNotTooLarge: false, isCorrectAngle: false };
        const { x, y, width, height } = detection.box;
        const videoWidth = this.videoElement.videoWidth;
        const videoHeight = this.videoElement.videoHeight;
        const cX = x + width/2, cY = y + height/2;
        const isCentered = Math.abs(cX - videoWidth/2) < videoWidth*0.3 && Math.abs(cY - videoHeight/2) < videoHeight*0.3;
        const faceArea = width*height, videoArea = videoWidth*videoHeight;
        const isSufficientSize = faceArea > videoArea*this.MIN_FACE_SIZE;
        const isNotTooLarge = faceArea < videoArea*this.MAX_FACE_SIZE;
        const pose = this.classifyFacePose(landmarks);
        const isCorrectAngle = (sampleType.startsWith('front') && pose === 'front') || (pose === sampleType);
        return { isCentered, isSufficientSize, isNotTooLarge, isCorrectAngle };
    }

    classifyFacePose(landmarks) {
        if (!landmarks) return 'front';
        const n = landmarks.getNose()[3], le = landmarks.getLeftEye()[0], re = landmarks.getRightEye()[3], m = landmarks.getMouth()[0];
        const eyeCenterX = (le.x + re.x)/2, eyeCenterY = (le.y + re.y)/2;
        const eyeDist = Math.max(1, re.x - le.x), faceH = Math.max(1, m.y - eyeCenterY);
        const yaw = (n.x - eyeCenterX)/eyeDist, pitch = (n.y - eyeCenterY)/faceH;
        if (pitch < -0.28) return 'up';
        if (yaw > 0.18) return 'left';
        if (yaw < -0.18) return 'right';
        return 'front';
    }

    updateAlignmentGuide(state, sampleType) {
        let text = ''; let color = '#0d6efd';
        switch(state) {
            case 'good': text = '✓ Perfect! Click Capture'; color = '#28a745'; break;
            case 'no_face': text = 'Center your face'; color = '#dc3545'; break;
            case 'center': text = 'Align face in circle'; color = '#ffc107'; break;
            case 'low_light': text = 'Too dark - Need more light'; color = '#ffc107'; break;
            case 'blurry': text = 'Hold steady - Image blurry'; color = '#fd7e14'; break;
            case 'too_small': text = 'Move closer to camera'; color = '#ffc107'; break;
            case 'too_large': text = 'Move further away'; color = '#ffc107'; break;
            case 'wrong_angle': text = this.getAngleGuidance(sampleType); color = '#ffc107'; break;
            default: text = 'Position face properly'; color = '#ffc107'; break;
        }
        if (this.alignmentOverlay) {
            const border = this.alignmentOverlay.querySelector('.border-3');
            if (border) border.style.borderColor = color;
        }
        if (this.instructionEl) this.instructionEl.textContent = text;
        if (this.guideTextEl) this.guideTextEl.textContent = text;
    }

    getAngleGuidance(sampleType) {
        const g = { 
            front_1: 'Look straight at camera', 
            front_2: 'Look straight at camera (2/2)', 
            right: 'Turn head slowly to the right',
            left: 'Turn head slowly to the left'
        };
        return g[sampleType] || 'Adjust position';
    }

    enableCaptureButton() {
        if (!this.captureBtn) return;
        if (this.currentSampleIndex < this.sampleSequence.length) {
            this.restoreCaptureButtonMode();
        }
        this.captureBtn.disabled = false;
        this.captureBtn.classList.remove('btn-secondary');
        this.captureBtn.classList.add('btn-success');
        this.captureBtn.style.opacity = '1';
    }

    disableCaptureButton() {
        if (!this.captureBtn) return;
        this.captureBtn.disabled = true;
        this.captureBtn.style.opacity = '0.5';
        this.captureBtn.classList.remove('btn-success');
        this.captureBtn.classList.add('btn-secondary');
    }

    restoreCaptureButtonMode() {
        if (!this.captureBtn) return;
        if (this.defaultCaptureBtnHtml) {
            this.captureBtn.innerHTML = this.defaultCaptureBtnHtml;
        }
        this.captureBtn.classList.remove('btn-primary');
        this.captureBtn.classList.add('btn-success');
    }

    setRetrySaveMode() {
        if (!this.captureBtn) return;
        this.captureBtn.innerHTML = '<i class="bi bi-arrow-repeat me-2"></i>Retry Save';
        this.captureBtn.classList.remove('btn-success', 'btn-secondary');
        this.captureBtn.classList.add('btn-primary');
        this.captureBtn.disabled = false;
        this.captureBtn.style.opacity = '1';
        if (this.instructionEl) {
            this.instructionEl.textContent = 'All samples captured. Tap Retry Save to submit again.';
        }
        if (this.guideTextEl) {
            this.guideTextEl.textContent = 'All samples captured. Tap Retry Save to submit again.';
        }
    }

    async captureSample() {
        if (this.currentState === this.UI_STATES.CAPTURING) return;
        if (this.currentSampleIndex >= this.sampleSequence.length) {
            if ((this.sampleDescriptors.list || []).length > 0) {
                await this.completeRegistration();
                return;
            }
            this.showError('Capture Missing', 'Please restart face registration and capture your samples again.');
            return;
        }
        const type = this.sampleSequence[this.currentSampleIndex];
        try {
            this.hideResult();
            this.disableCaptureButton();
            this.setState(this.UI_STATES.CAPTURING);
            const descriptor = await this.captureFaceDescriptor();
            if (!descriptor || descriptor.length !== 128) throw new Error('Face not ready. Hold steady and try again.');
            
            // Map internal sample IDs to backend-friendly types
            const backendType = type.startsWith('front') ? 'front' : type;
            
            // Store as a list to support multiple 'front' samples
            if (!this.sampleDescriptors.list) this.sampleDescriptors.list = [];
            this.sampleDescriptors.list.push({
                type: backendType,
                embedding: Array.from(descriptor)
            });

            this.samples[type] = true;
            this.currentSampleIndex++;
            this.lastDescriptor = null;
            this.cachedDetection = null;
            this.lastDetectionTime = 0;
            this.updateProgress();
            
            if (this.currentSampleIndex >= this.sampleSequence.length) {
                await this.completeRegistration();
            } else {
                this.setState(this.UI_STATES.DETECTING);
                this.detectionStabilityFrames = 0;
            }
        } catch (e) { 
            this.showError('Capture Failed', e.message); 
            this.setState(this.UI_STATES.DETECTING); 
        }
    }

    async captureFaceDescriptor() {
        if (this.cachedDetection?.descriptor?.length === 128) return this.cachedDetection.descriptor;
        if (this.lastDescriptor?.length === 128) return this.lastDescriptor;
        const detections = await faceapi.detectSingleFace(this.videoElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 })).withFaceLandmarks().withFaceDescriptor();
        if (detections?.descriptor?.length === 128) {
            this.cachedDetection = detections;
            this.lastDescriptor = detections.descriptor;
            this.lastDetectionTime = Date.now();
            return detections.descriptor;
        }
        return null;
    }

    updateProgress() {
        const done = this.currentSampleIndex, total = this.sampleSequence.length;
        if (this.sampleCountEl) this.sampleCountEl.textContent = `Samples: ${done} / ${total}`;
        if (this.progressEl) this.progressEl.style.width = (done/total)*100 + '%';
        
        // Update labels for the next pose
        if (done < total) {
            const nextPose = this.sampleSequence[done];
            const labels = { 
                front_1: 'Full Face (1/2)', 
                front_2: 'Full Face (2/2)', 
                right: 'Turn Right',
                left: 'Turn Left'
            };
            const labelText = labels[nextPose] || nextPose;
            
            // Update all potential label elements
            if (this.statusEl) this.statusEl.textContent = `Next Pose: ${labelText}`;
            
            // Update registration-sample-count if it exists
            const regCount = document.getElementById('registration-sample-count');
            if (regCount) regCount.textContent = `Samples Captured: ${done} / ${total}`;
            
            // Update registration-instruction if it exists
            const regInst = document.getElementById('registration-instruction');
            if (regInst) regInst.textContent = `Sample ${done + 1}: ${this.getAngleGuidance(nextPose)}`;
        }
    }

    async completeRegistration() {
        try {
            this.setState(this.UI_STATES.PROCESSING);
            this.stopDetection();
            
            // Send the list of embeddings
            const result = await apiRequest('register_face', 'POST', { 
                embeddings: this.sampleDescriptors.list 
            });
            
            if (result.success) {
                this.setState(this.UI_STATES.SUCCESS);
                this.disableCaptureButton();
                setTimeout(() => this.handleRegistrationSuccess(), 1500);
            } else throw new Error(result.error || 'Failed');
        } catch (e) {
            this.showError('Registration Save Failed', e.message || 'Unable to save face registration.');
            this.setState(this.UI_STATES.FAILED);
            if ((this.sampleDescriptors.list || []).length > 0) {
                this.setRetrySaveMode();
            }
        }
    }

    resetSamples() {
        this.samples = { 
            front_1: null, 
            front_2: null, 
            right: null,
            left: null
        };
        this.sampleDescriptors = { list: [] };
        this.currentSampleIndex = 0;
        this.detectionStabilityFrames = 0;
        this.cachedDetection = null;
        this.lastDetectionTime = 0;
        this.lastDescriptor = null;
        this.restoreCaptureButtonMode();
        this.updateProgress();
        this.disableCaptureButton();
    }

    setState(newState) {
        this.currentState = newState;
        if (this.alignmentOverlay) this.alignmentOverlay.classList.toggle('d-none', newState !== this.UI_STATES.DETECTING);
    }

    showSuccess(title, message) { this.showResult('success', `<strong>${title}</strong><br>${message}`); }
    showError(title, message) {
        this.showResult('error', `<strong>${title}</strong><br>${message}`);
        if (typeof window.showToast === 'function') {
            window.showToast(`${title}: ${message}`, 'danger');
        }
    }

    hideResult() {
        if (!this.resultAlertEl) return;
        this.resultAlertEl.classList.add('d-none');
        this.resultAlertEl.innerHTML = '';
    }

    showResult(type, message) {
        if (!this.resultAlertEl) return;
        this.resultAlertEl.className = `alert alert-${type === 'error' ? 'danger' : 'success'} mt-3`;
        this.resultAlertEl.innerHTML = message;
        this.resultAlertEl.classList.remove('d-none');
    }

    async registerFaceWithBackend() {
        return await apiRequest('register_face', 'POST', { embeddings: this.sampleDescriptors.list || [] });
    }

    handleRegistrationSuccess() {
        this.stopCamera();
        this.resetSamples();
        if (window.faceRegistrationCallback) window.faceRegistrationCallback(true);
    }

    cancelRegistration() {
        if (confirm('Discard changes?')) {
            this.stopCamera();
            this.resetSamples();
            if (window.faceRegistrationCallback) window.faceRegistrationCallback(false);
        }
    }

    stopCamera() {
        this.stopDetection();
        if (this.stream) this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
        this.cachedDetection = null;
        this.lastDetectionTime = 0;
        this.lastDescriptor = null;
        if (this.videoElement) {
            this.videoElement.style.setProperty('transform', 'none', 'important');
            this.videoElement.style.setProperty('-webkit-transform', 'none', 'important');
        }
    }
}

window.FaceRegistrationModule = FaceRegistrationModule;
