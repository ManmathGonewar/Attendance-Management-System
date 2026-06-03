# Viva Ready Guide

This file is a viva/interview-ready guide for explaining the project in simple Marathi + English mix.

It is based on:
- `SYSTEM_ARCHITECTURE.md`
- current backend code in `backend/`
- current frontend flow in `assets/js/app.js` and `assets/js/face-verification.js`

The goal of this file is not just to repeat the architecture document, but to give a code-aligned explanation that you can actually speak in an interview.

---

## 1. First 20-Second Introduction

Use this when examiner says: "Tell me about your project."

```text
Good morning sir/ma'am.

My project is Attendance Management System with Face Verification and Geofencing.
Ha ek multi-college, role-based attendance platform aahe jithe Super Admin, College Admin, Faculty, ani Student ase four main roles aahet.

System madhe faculty attendance session start karto ani OTP generate karto.
Student OTP verify karto, face verify karto, ani college location valid asel tar attendance mark hote.

Frontend sathi mi HTML, CSS, Bootstrap, ani Vanilla JavaScript use kelay, and backend sathi PHP with MySQL/MariaDB use kelay.
Main objective hota secure, automated, and proxy-free attendance system build karne.
```

---

## 2. 1-Minute Viva Script

```text
Good morning sir/ma'am.

My project name is Attendance Management System with Face Verification and Geofencing.
This is a multi-college SaaS-based platform where four types of users are supported: Super Admin, College Admin, Faculty, and Student.

The main problem I wanted to solve was proxy attendance and manual attendance handling.
So I designed a secure attendance workflow where faculty starts an attendance session and the system generates a time-bound OTP.
Student enters that OTP, then the system performs face verification, and if college geofencing is configured, it also checks the student location.
Only after all required validations are passed, attendance is marked in the database.

From the technical side, frontend is built using HTML, CSS, Bootstrap, and Vanilla JavaScript in SPA style.
Backend is implemented using PHP and MySQL/MariaDB with API-based routing.
I also used Face-API.js for face embedding generation in the browser.

Important features of the system are role-based access control, college-wise data isolation, face registration, OTP-based attendance, duplicate prevention, audit logging, and attendance reporting.

In short, this project converts traditional attendance into a secure digital workflow that is scalable, role-based, and more reliable.
```

---

## 3. Backend Explanation Script

Use this when examiner asks: "Backend kasa implement kel?" or "Explain backend architecture."

```text
Backend mi plain PHP and MySQL/MariaDB madhe implement kelay.
Mi intentionally framework-light approach use kela because deployment simple pahije hota, especially shared hosting type environment sathi.

Backend cha main entry point `backend/public/api.php` aahe.
Frontend madhun sagle requests `?action=...` format ne ya single API router la yetaat.
Ya router madhe first config load hote, nantar session initialize hote, database connection establish hoto, ani required migrations run hotaat.

Tyachyanantar request role and authentication nusar proper controller kade route keli jate.
Mi backend code domain-wise split kelay, for example:
authentication sathi AuthController and AuthService,
college management sathi CollegeController and SuperAdminController,
college-level operations sathi CollegeAdminController,
attendance workflow sathi AttendanceController,
faculty operations sathi FacultyController,
student-specific operations sathi StudentController.

Shared functionality sathi helper functions and services use kele aahet.
Database access sathi PDO with prepared statements use kele aahet, so SQL injection risk reduce hoto.

Session handling `Session.php` madhe aahe.
Role validation and access control centralized thevla aahe.
Multi-college isolation sathi `college_id` based scoping use keli aahe, mhanun ek college cha data dusrya college la accessible nahi.

Attendance cha secure part `FaceVerificationService` madhun implement kelay.
Student face registration time la raw image permanently store nahi karto, only 128-dimensional face embeddings store karto.
Verification time la live embedding compare keli jate and distance-based matching logic use kela jato.

Attendance mark karaychya aadhi backend OTP validation, class binding, face verification status, duplicate prevention, and location validation he sagle checks karto.

Audit logging pan implement kelay, mhanun important actions jase login, college creation, session start, attendance mark, he sagle log hotaat.

Overall backend architecture cha focus hota modularity, security, simple deployment, and role-based business logic separation.
```

---

## 4. Full Project Explanation Script

Use this as 2-3 minute answer.

```text
Good morning sir/ma'am.

My project is Attendance Management System with Face Verification and Geofencing.
This project is designed as a multi-college attendance platform, meaning one system can manage multiple colleges while keeping each college's data isolated.

The system supports four main roles:
Super Admin, who manages the complete platform and colleges;
College Admin, who manages students, faculty, departments, timetable, and settings for one college;
Faculty, who starts attendance sessions and monitors attendance;
and Student, who registers face, views timetable, and marks attendance.

The frontend is built using HTML, CSS, Bootstrap, and Vanilla JavaScript.
It behaves like a single-page application where the dashboard and modules change according to the logged-in role.

The backend is implemented using PHP and MySQL/MariaDB.
All API requests go through a single entry point, and from there the request is routed to dedicated controllers.
I separated the logic into controllers, services, session handling, database connection, and helper utilities for better maintainability.

The core functionality of the project is the attendance marking pipeline.
First, faculty starts an attendance session for a scheduled class.
The system generates a 6-digit OTP with expiry.
Student enters that OTP.
After OTP validation, face verification is performed using Face-API.js generated embeddings.
The system compares the live face embedding with the student’s registered embeddings stored in the database.
If the face match is valid, then location is verified using geofencing rules if college location is configured.
Finally, attendance is marked and stored with metadata such as match score, timestamp, and location verification result.

For security, I implemented role-based access control, session timeout, college-wise data isolation, prepared SQL statements, duplicate attendance prevention, face verification attempt limits, and audit logging.
The system also avoids storing raw face images and instead stores numeric embeddings for privacy.

Additional modules include student and faculty management, department and course management, timetable management, notice board, attendance history, reporting, archive system, and profile management.

One more useful aspect is that the project is PWA-ready, so it can work in an app-like way on mobile devices.

In summary, this project is not only an attendance app, but a secure academic workflow platform that combines authentication, timetable management, OTP-based attendance, face verification, and geofencing in one integrated system.
```

---

## 5. Simplified System Architecture

Explain this if examiner asks: "Architecture samjha."

### High-Level Flow

```text
Browser/UI
  -> API Router
  -> Controllers and Services
  -> Database
```

### Layer-Wise Explanation

#### 1. Presentation Layer

- `index.html` works as the main application shell.
- `assets/js/app.js` handles SPA navigation, role-based rendering, API calls, dashboard loading, and page switching.
- `assets/js/face-verification.js` handles camera access, face detection, live capture, and verification UI flow.

#### 2. API Layer

- `backend/public/api.php` is the single backend entry point.
- It loads config, session context, database connection, helpers, services, and controllers.
- Then it routes requests using `action` names like `login`, `verify_face`, `mark_attendance`, `timetable_list`, etc.

#### 3. Business Logic Layer

- Controllers are separated by responsibility:
  - `AuthController`
  - `SuperAdminController`
  - `CollegeAdminController`
  - `FacultyController`
  - `StudentController`
  - `AttendanceController`
  - `TimetableController`
  - `AcademicController`
  - `ProfileController`
- Services contain reusable logic:
  - `AuthService` for authentication
  - `AuditService` for logging
  - `FaceVerificationService` for face matching and geofencing

#### 4. Security Layer

- `Session.php` stores current user and role context.
- `Session::requireRole()` ensures only allowed roles can access specific APIs.
- College-level isolation is enforced using `college_id`.
- Important activities are saved in `audit_logs`.

#### 5. Data Layer

Main database tables:
- `colleges`
- `users`
- `departments`
- `students`
- `faculty`
- `courses_sections`
- `timetable`
- `attendance_sessions`
- `otp_logs`
- `face_embeddings`
- `face_verification_attempts`
- `attendance_records`
- `audit_logs`

### Attendance Architecture Flow

```text
Faculty starts session
-> OTP generated
-> Student submits OTP
-> Face verification
-> Location verification
-> Attendance record inserted
-> Faculty dashboard updates
```

---

## 6. What I Found After Analyzing `SYSTEM_ARCHITECTURE.md`

The architecture document is useful and detailed, but a few sections are now partially outdated compared to the current codebase.

### Correct / Still Useful

- Multi-college SaaS structure is correct.
- Four-role system is correct.
- OTP + face + location attendance concept is correct.
- Audit trail concept is correct.
- Data isolation by `college_id` is correct.
- Main DB entities and relationships are mostly correct.

### Important Code-Aligned Corrections

#### 1. `api.php` is now a thin router

`SYSTEM_ARCHITECTURE.md` describes `api.php` as a very large monolithic file.
Current code has already been refactored.

Current reality:
- `backend/public/api.php` is a thin dispatcher
- major logic has moved into controller files and services

Why this matters in viva:
- You can say the system was modularized into controllers and services, not kept monolithic.

#### 2. `face_embeddings` is no longer single-embedding only

The architecture document mentions a uniqueness model that implies one face embedding per student.
Current implementation supports multiple embeddings per student for multiple angles.

Current reality:
- `FaceVerificationService` explicitly migrates old unique constraint away
- student can register multiple embeddings
- this improves accuracy and robustness

#### 3. Attendance flow in current code is stricter at final mark stage

The architecture document presents one conceptual sequence.
Current implementation enforces security mainly at `mark_attendance` stage:

- OTP must be verified
- session must be active
- student must belong to that class
- face verification must already be accepted
- location is validated again before saving final attendance

So even if preview/check endpoints are called separately, final attendance still depends on all validations.

#### 4. Some endpoint descriptions in the architecture doc are outdated

Example:
- `otp_preview` is currently implemented in `AttendanceController` and used for student-side session preview
- it is not a faculty-owned API in the current router design

#### 5. Environment variable names in the document differ from current code

The architecture file mentions names like:
- `DATABASE_HOST`
- `DATABASE_USER`
- `DATABASE_PASSWORD`

Current code actually uses:
- `DB_HOST`
- `DB_PORT`
- `DB_SOCKET`
- `DB_NAME`
- `DB_USER`
- `DB_PASS`
- `DB_CHARSET`

So viva madhe config explain kartaana current code names bola.

#### 6. Face threshold examples in the document are legacy-level examples

The architecture file shows simplified score thresholds.
Current code uses distance-based matching in `FaceVerificationService` and derives UI-friendly percentages from that.

Best viva-safe way to say it:
- "System uses Euclidean distance-based comparison on 128-dim embeddings and applies accept/retry/reject logic with max attempt control."

### Final Analysis Summary

Best interpretation is:
- `SYSTEM_ARCHITECTURE.md` is a conceptual and specification-level document
- current source code is the implementation-level truth
- for viva, use architecture document for system vision
- use current code structure for technical accuracy

---

## 7. Examiner-Friendly Backend Mapping

If examiner asks "which file does what?", use this.

```text
backend/public/api.php
  -> main API router

backend/config/config.php
  -> environment and session configuration

backend/src/Database.php
  -> PDO database connection

backend/src/Session.php
  -> authentication session and role helpers

backend/src/Helpers.php
  -> JSON helpers, schema bootstrap, lazy migrations, utility functions

backend/src/Controllers/
  -> request-wise business handling

backend/src/Services/AuthService.php
  -> login validation

backend/src/Services/AuditService.php
  -> audit logs

backend/src/Services/FaceVerificationService.php
  -> embeddings, face verification, attempts, geofence, attendance save
```

---

## 8. Short Answer for "Why This Design?"

```text
Mi single-entry API router + modular controllers/services pattern use kela because mala code deploy karayla simple pahije hota, pan maintainability pan preserve karaychi hoti.
So routing central thevla, pan business logic separate classes madhe split kelay.
This made the backend easier to scale, debug, and explain.
```

---

## 9. Keywords You Should Repeat in Viva

Use these exact keywords naturally:

- multi-college SaaS
- role-based access control
- OTP-based attendance
- face verification
- geofencing
- college-wise data isolation
- audit logging
- duplicate prevention
- prepared statements
- modular PHP backend

---

## 10. Best Final Closing Line

Use this at the end of explanation:

```text
So overall, this project combines academic management with secure attendance verification, and the main strength of the system is that it integrates OTP, face verification, role-based control, and college-level data isolation in one practical platform.
```

