# Face Verification Module - Complete Documentation

## Overview

This is a comprehensive Face Verification module for a web-based Attendance Management System (AMS) that uses browser-based AI (Face-API.js) for secure, proxy-resistant attendance marking. The system works entirely in modern browsers without external hardware, supporting both mobile and desktop devices.

## Architecture

### Backend (PHP)
- `FaceVerificationService.php` - Core face verification logic
- Database tables for embeddings, attempts, and records
- API endpoints for OTP validation, face verification, and attendance marking
- Location verification using GPS coordinates

### Frontend (JavaScript)
- `face-verification.js` - Face detection and capture module
- Integrates Face-API.js for real-time face analysis
- Guided UI with face positioning feedback
- Retry logic with attempt tracking

### Database
- `face_embeddings` - Stores 128-dimensional face vectors
- `face_verification_attempts` - Tracks verification attempts per session
- `attendance_records` - Records final attendance with match scores
- `college_location_settings` - College GPS boundaries for location verification

## Complete Verification Flow

### 1. **OTP Validation** (Prerequisite)
```
Student logs in → Enters 6-digit OTP → System validates OTP + session status
↓
OTP_VALIDATED → Face verification UI becomes visible
```

**Backend Check:**
- OTP must match active session
- Session status must be "active"
- OTP expiry must be within 5-minute window
- One OTP per session per student (prevents duplicate marking)

### 2. **Camera Activation & Permissions**
```
Face verification UI visible → Click "Verify Face" → Browser requests camera access
↓
User grants camera → Video stream starts
```

**Handled Scenarios:**
- Camera permission denied → Show platform-specific help
- No camera found → Display device message
- Camera in use → Suggest closing other apps
- HTTPS required → Works securely on HTTPS only

### 3. **Real-time Face Detection**
```
Camera active (10 FPS detection loop) → Face-API analyzes frames
↓
Face detected → Check positioning → Update UI guidance
Face not detected → Reset stability counter
```

**Guidance States:**
- "No face detected" - Red border
- "Adjust position" - Yellow border (off-center)
- "Position looks good" - Green border (ready for capture)

**Position Requirements:**
- Face centered in frame (±20% tolerance)
- Face 30-80% of video area (sufficient size, not too close)
- Minimum 10 consecutive frames with stable positioning

### 4. **Face Capture & Embedding**
```
Face positioned + stable → "Verify Face" button enabled
Student clicks button → Capture 128-dim face descriptor from frame
↓
Send embedding to backend for verification
```

### 5. **Face Matching Logic**
```
Backend receives live embedding + session_id + student_id
↓
1. Validate OTP was verified (from otp_logs table)
2. Validate student has registered face (face_embeddings table)
3. Retrieve stored embedding for student
4. Compute Euclidean distance between embeddings
5. Convert distance to similarity percentage (0-100%)
6. Apply thresholds to make decision
```

**Similarity Thresholds:**
- **≥85%**: ACCEPT → Proceed to location verification
- **75-84%**: RETRY → Prompt adjustment, allow re-capture
- **<75%**: REJECT → Provide feedback (lighting, positioning)

### 6. **Attempt Tracking**
```
Verification attempt → Increment attempts_used in face_verification_attempts
↓
Decision = ACCEPT → Mark attendance, lock verification
Decision = RETRY → Attempts < 3 → Allow next attempt
Decision = REJECT → Attempts < 3 → Allow next attempt
Attempts >= 3 → LOCK verification, no more attempts
```

**Attempt Limits:**
- Maximum 3 attempts per student per session
- After 3 failed attempts, verification is locked
- Student can re-enter OTP to get 3 new attempts

### 7. **Location Verification** (Optional but Recommended)
```
Face match successful (≥85%) → Browser requests GPS location
↓
Calculate distance from college coordinates using Haversine formula
↓
Distance ≤ 200m radius → ACCEPT
Distance > 200m radius → REJECT (show distance for context)
Location access denied → REJECT with permission instructions
```

**Database Configuration:**
```sql
INSERT INTO college_location_settings (college_id, latitude, longitude, radius_meters)
VALUES (1, 19.0760, 72.8777, 200);  -- Example: Mumbai coordinates, 200m radius
```

### 8. **Attendance Recording**
```
All verifications pass:
  ✓ OTP validated
  ✓ Face match ≥ 85%
  ✓ Location within radius (if configured)
↓
INSERT INTO attendance_records (session_id, student_id, match_score, status='present')
↓
Student cannot mark attendance again for this session
```

**Record Structure:**
```
id: Auto-increment
session_id: Attendance session reference
student_id: Student reference
timestamp: When attendance was marked
match_score: Face similarity percentage (0-100)
location_lat/lng: GPS coordinates captured
location_verified: 1 if within college radius
status: 'present' only on success
```

## Face Registration Requirements

### Capturing Multiple Samples
The system is designed to capture multiple face angles during registration:

**Sample Types:**
1. **Front** - Direct face, neutral expression
2. **Left** - 15-20° angle to left
3. **Right** - 15-20° angle to right
4. **Neutral** - Straight face, relaxed expression
5. **Optional: Glasses** - If student typically wears glasses

**Current Implementation:**
- Stores single best embedding (front view)
- Can be extended to multi-sample matching for robustness

**Registration Best Practices:**
- Good lighting (natural light preferred)
- Clear face without obstructions
- Neutral expression (not smiling)
- Centered in frame
- Remove glasses if possible (wear them during attendance if registered with them)

### Data Storage
```
❌ Raw face photos are NOT stored
✅ Only 128-dimensional embedding vectors stored in face_embeddings table

Privacy benefit: Embeddings cannot be reverse-engineered to reconstruct photos
```

## API Endpoints

### 1. OTP Validation
```
POST /api.php?action=submit_otp
{
  "otp": "123456"
}

Response:
{
  "success": true,
  "session_id": 42,
  "attempts_left": 3,
  "max_attempts": 3
}
```

### 2. Face Verification
```
POST /api.php?action=verify_face
{
  "session_id": 42,
  "live_embedding": [0.123, -0.456, ..., 0.789]  // 128 floats
}

Response:
{
  "success": true,
  "match_score": 87.5,
  "decision": "ACCEPT",  // or "RETRY", "LOCKED"
  "message": "Face verified successfully",
  "attempts_remaining": 2
}
```

### 3. Location Verification
```
POST /api.php?action=verify_location
{
  "session_id": 42,
  "latitude": 19.0760,
  "longitude": 72.8777
}

Response:
{
  "success": true,
  "message": "Location verified",
  "distance": 150.25,  // meters from college
  "radius": 200       // allowed radius
}
```

### 4. Mark Attendance
```
POST /api.php?action=mark_attendance
{
  "session_id": 42
}

Response:
{
  "success": true,
  "message": "Attendance marked successfully",
  "status": "present"
}
```

### 5. Face Registration
```
POST /api.php?action=face_register
{
  "embedding_vector": [0.123, -0.456, ..., 0.789]  // 128 floats
}

Response:
{
  "success": true
}
```

## JavaScript Integration

### Initialize Module
```javascript
const faceModule = initFaceVerificationModule();
```

### Start Face Verification
```javascript
// After OTP validation
faceModule.initializeForVerification(sessionId, studentId);
```

### Key Methods
```javascript
faceModule.activateCamera()              // Request camera, start detection
faceModule.handleVerifyClick()           // Capture and verify face
faceModule.requestLocation()             // Get GPS coordinates
faceModule.markAttendance()              // Final attendance record
faceModule.destroy()                     // Cleanup (stop camera, timers)
```

## Security Features

### 1. **OTP-Gated Access**
- Face verification UI hidden until OTP validated
- Prevents direct API access without valid OTP
- OTP expires after 15 minutes

### 2. **Session Validation**
- Must validate OTP and session status before each face verification step
- Attendance can only be marked within session validity window
- One attendance per student per session (duplicate prevention)

### 3. **Anti-Spoof Measures**
- Requires stable face detection (10+ consecutive frames)
- Real-time positioning validation
- Multiple frame sampling before matching
- Could be enhanced with blink/movement detection (future)

### 4. **Attempt Throttling**
- Maximum 3 attempts per session
- Automatic lockout after exceeding attempts
- Student must re-enter OTP for fresh attempts
- Logs all attempt details for audit trail

### 5. **Location Verification**
- GPS-based college perimeter enforcement
- Configurable radius (default 200 meters)
- Prevents remote attendance (proxy candidates nearby)
- Optional but highly recommended for in-person verification

### 6. **Data Privacy**
- No raw face photos stored
- Only mathematical embeddings stored
- Embeddings cannot reconstruct original photos
- HTTPS required for all camera operations
- Browser-only processing (no intermediate servers)

### 7. **Audit Trail**
- All verification attempts logged with:
  - Student ID
  - Session ID
  - Match score
  - Decision (accept/reject)
  - Timestamp
  - Attempt count

## Error Handling & User Feedback

### Camera Errors
```
Camera Permission Denied
→ Show platform-specific help (Chrome, Firefox, Safari, Mobile)
→ Provide "Retry" and "Help" buttons

No Camera Found
→ Display device message
→ Suggest alternative devices

Camera Not Accessible
→ Other app using camera
→ Suggest closing other applications
→ Provide help link
```

### Face Detection Errors
```
No Face Detected
→ Guidance: "Center your face"
→ Real-time instruction overlay

Multiple Faces Detected
→ Show error message
→ Guidance: "Only one person per verification"
→ Reset detection state

Face Obscured
→ Detect via low landmark confidence
→ Guidance: "Remove obstructions"

Poor Lighting
→ Could be detected via expression confidence
→ Guidance: "Improve lighting"
```

### Verification Errors
```
Face Not Registered
→ Redirect to face registration page
→ Show registration guidance

Match Score Too Low (< 75%)
→ Show current match score
→ Guidance: "Adjust position/lighting and retry"
→ Allow retry (if attempts < 3)

Location Out of Range
→ Show distance and required radius
→ Message: "You are {distance}m from campus, {radius}m allowed"
→ Allow face re-verification from correct location

Maximum Attempts Exceeded
→ Show attempt counter
→ Guidance: "Re-enter OTP for 3 new attempts"
→ Lock face verification
```

## Configuration

### Database
```php
// In api.php (already defined)
const FACE_MATCH_ACCEPT_THRESHOLD = 85.0;
const FACE_MATCH_RETRY_THRESHOLD = 75.0;
const FACE_MAX_ATTEMPTS = 3;
const OTP_VALIDATION_WINDOW = 300; // seconds
const LOCATION_VERIFICATION_RADIUS = 200; // meters
```

### College Location Setup
```sql
-- For college admin to set
INSERT INTO college_location_settings (college_id, latitude, longitude, radius_meters)
VALUES (1, 19.0760, 72.8777, 200);

-- Update existing
UPDATE college_location_settings 
SET latitude = 19.0760, longitude = 72.8777, radius_meters = 250
WHERE college_id = 1;
```

## Frontend HTML Structure

The module expects these elements in the DOM:
```html
<video id="attendance-camera"></video>
<div id="face-guide-overlay"></div>
<div id="attendance-placeholder"></div>
<div id="attendance-camera-error"></div>
<button id="face-verify-btn"></button>
<div id="match-score"></div>
<div id="attendance-status"></div>
<div id="attendance-result"></div>
<div id="verification-attempts"></div>
<div id="verification-progress"></div>
```

## CSS Requirements
- Include `assets/css/face-verification.css` in HTML
- Bootstrap 5.3.3 for base styling
- Modern browser CSS features (flex, grid, animations)

## JavaScript Dependencies
1. **Face-API.js** - Face detection & recognition
   ```html
   <script src="https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js"></script>
   ```

2. **Bootstrap 5** - UI components
   ```html
   <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
   ```

3. **Custom module** - Face verification logic
   ```html
   <script src="assets/js/face-verification.js"></script>
   ```

## Browser Support

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 76+ | ✅ Full support |
| Edge | 79+ | ✅ Full support |
| Firefox | 55+ | ✅ Full support |
| Safari | 14.1+ | ✅ Full support |
| Mobile Chrome | Latest | ✅ Full support |
| Mobile Safari | 14.5+ | ✅ Full support |
| Mobile Firefox | Latest | ✅ Full support |

**Requirements:**
- HTTPS (camera access requires secure context)
- Modern JavaScript (ES6+)
- WebRTC support
- getUserMedia API support

## Testing Checklist

### Camera & Detection
- [ ] Camera permission prompt works
- [ ] Camera permission denied handling works
- [ ] Video stream displays correctly
- [ ] Face detection works in good lighting
- [ ] Face detection fails gracefully in poor lighting
- [ ] Real-time guidance updates correctly
- [ ] Guide overlays show proper instructions

### Face Verification
- [ ] Face registered student passes verification
- [ ] Match score displays correctly
- [ ] Low match score triggers retry prompt
- [ ] High match score triggers location verification
- [ ] Attempt counter increments correctly
- [ ] After 3 attempts, verification locks
- [ ] Re-entering OTP resets attempt counter

### Location Verification
- [ ] GPS location request works
- [ ] Location permission denied handled
- [ ] Distance calculation correct
- [ ] Within radius allows attendance
- [ ] Outside radius rejects attendance

### Attendance Recording
- [ ] Attendance marked only after all checks
- [ ] Duplicate attendance prevented
- [ ] Match score recorded
- [ ] Timestamp recorded correctly
- [ ] Student cannot mark twice per session

### Mobile Testing
- [ ] Responsive layout works
- [ ] Camera works on mobile devices
- [ ] Touch controls work
- [ ] Portrait/landscape orientation works
- [ ] Battery optimization (frame rate, detection interval)

## Performance Optimization

### JavaScript
- Face detection runs at 10 FPS (100ms interval)
- Models lazy-loaded on first verification
- Cleanup on session end (stop camera, clear intervals)

### Database
- Indexes on (session_id, student_id) for fast lookups
- Unique constraint prevents duplicate attempts
- Prepared statements prevent SQL injection

### Network
- Embedding vectors (~512 bytes) compressed
- Batch API calls where possible
- Timeout handling for slow connections

## Future Enhancements

1. **Multi-angle Verification**
   - Store and match multiple face angles
   - Improved robustness for varying conditions

2. **Liveness Detection**
   - Require blink or head movement
   - Prevent photo/video spoofing

3. **Advanced Anti-Spoof**
   - Infrared/depth sensing (hardware)
   - Real-time expression analysis
   - Micro-expression detection

4. **Geofencing Improvements**
   - WiFi-based geofencing as backup
   - Stronger location spoofing prevention

5. **Machine Learning Optimization**
   - Custom model training on college-specific faces
   - Improved local face database indexing

6. **Accessibility**
   - WCAG 2.1 AA compliance
   - Screen reader support
   - Keyboard-only navigation

## Troubleshooting

### Camera Not Working
1. Check HTTPS connection
2. Verify browser permissions
3. Try different browser
4. Check system camera permissions
5. Restart browser/device

### Face Not Detected
1. Improve lighting
2. Move closer to camera
3. Remove obstructions
4. Check camera clarity
5. Try different angle

### Low Match Scores
1. Ensure good lighting (same as registration)
2. Remove/add glasses (match registration)
3. Change facial expression to neutral
4. Reposition face in center
5. Consider re-registering face

### Location Issues
1. Enable GPS on device
2. Allow location permission
3. Check location accuracy
4. Ensure within college radius
5. Verify college coordinates are correct

## Support & Documentation

- Backend: `FaceVerificationService.php` - Well-documented class methods
- Frontend: `face-verification.js` - Detailed JSDoc comments
- API: Comprehensive endpoint documentation above
- Database: Schema includes comments for all face-related tables
