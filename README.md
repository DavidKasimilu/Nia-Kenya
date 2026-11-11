# Nia - Platform 

[![GitHub Release](https://img.shields.io/github/v/release/nkepe/Nia-Platform?color=0f172a&label=version)](https://github.com/nkepe/Nia-Platform/releases/tag/v1.0.0)
[![License: No License](https://img.shields.io/badge/License-NoLicense-yellow.svg)](https://opensource.org/licenses/MIT)
[![Supabase](https://img.shields.io/badge/Backend-Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=flat&logo=cloudflare&logoColor=white)

**Nia** is a web-based recruitment and attachment matching platform engineered to bridge the gap between tertiary institution students, graduates, and prospective employers across Kenya. The application streamlines student discovery of industrial attachments, internships, and entry-level positions, providing direct application workflows, CV attachment capabilities, and a dedicated administrative console for moderation.

---

## Table of Contents
- [Project Overview](#project-overview)
- [Key Features](#key-features)
- [System Architecture & Stack](#system-architecture--stack)
- [Database Schema & Security (RLS)](#database-schema--security-rls)
- [File & Storage Specifications](#file-storage-specifications)
- [Administrative Controls](#administrative-controls)
- [Author & Academic Credits](#author--academic-credits)

---

## Project Overview

Tertiary students in emerging regions face significant friction in discovering verified industrial attachments and internship openings. **Nia** addresses this challenge through:
1. **Centralized Discovery:** Consolidated listings of verified opportunities filtered by industry, location, and contract type.
2. **Simplified Application Pipelines:** One-click application tracking linked directly to the student's profile and curriculum vitae (CV).
3. **Institutional Governance:** Granular administrator controls to audit listings, manage student submissions, and enforce account suspensions or data pruning.

---

## Key Features

### Student Portal
- **Session Authentication:** Secure authentication handling sign-up, sign-in, and persistent session state.
- **Dynamic Search & Filtering:** Real-time search across job titles, organization names, and geographic locations (e.g., Voi, Mombasa, Nairobi, Remote), accompanied by contract-type sorting.
- **Application Tracking:** History view of all submitted opportunities with direct visual indicators (`Submitted` / `Applied`).
- **Profile & Resume Management:** Central profile editor enabling students to maintain contact information, institutional affiliation, academic courses, and upload documents up to 30MB.
- **Application Advisory Flow:** Responsive prompt encouraging applicants to upload a resume prior to submission to optimize applicant review.

### Administrator Control Center
- **Publishing Console:** Dedicated portal for composing and launching opportunities with custom categorization.
- **Listing Governance:** Real-time editing and cascading deletion of stale or fulfilled opportunity postings.
- **Application Auditing:** Review of incoming applicants, submission timestamps, and instant preview of uploaded resumes.
- **User Moderation (Ban/Delete):** Platform-level account suspension via status flags, and hard user purges using PostgreSQL `SECURITY DEFINER` Remote Procedure Calls (RPC).

---

## System Architecture & Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend UI** | HTML5, CSS3 (Custom Responsive Layouts), JavaScript (ES6 Modules) |
| **Icons & Assets** | Font Awesome 6.5, SVG Vector Icons |
| **Authentication** | Supabase Auth (JWT-based session management) |
| **Database** | PostgreSQL hosted on Supabase |
| **Cloud Storage** | Supabase S3-Compatible Object Storage |
| **URL & pk Security** | Cloudflare EDGE workers |
| **Authorization** | Row Level Security (RLS) Policies & Postgres Functions |

---

## Database Schema & Security (RLS)

The platform enforces Row Level Security (RLS) across all operational tables to safeguard student data privacy:

### Tables
1. **`profiles`**: Stores student biographical data, academic department, and resume pointers.
   - Columns: `id (UUID, PK)`, `email`, `full_name`, `phone`, `institution`, `course`, `bio`, `resume_url`, `status`, `role`.
2. **`opportunities`**: Stores verified internship and attachment openings.
   - Columns: `id (UUID, PK)`, `title`, `company`, `location`, `type`, `description`, `created_at`.
3. **`applications`**: Matches student accounts to opportunity records.
   - Columns: `id (UUID, PK)`, `opportunity_id (FK)`, `user_id (FK)`, `user_email`, `resume_url`, `created_at`.

### Relational Integrity & Cascades
Deletions execute via `ON DELETE CASCADE`:
- Removing an opportunity automatically purges its associated application logs.
- Admin execution of `delete_user_by_admin(uuid)` deletes the identity record from `auth.users`, cascading through both public profiles and submitted applications.

---

## File & Storage Specifications

- **Bucket Identifier:** `resumes`
- **Bucket Visibility:** `Public` (direct reading enabled for hiring administrators)
- **Upload Constraints:** File size capped at **30MB** (`31,457,280 bytes`).
- **Accepted MIME Types:** `.pdf`, `.doc`, `.docx` (`application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`).
- **Storage Policy:** Folder structure isolated by applicant user ID (`{user_id}/resume_{timestamp}.ext`), preventing unauthorized directory walking.

1. **Clone the Repository:**
   ```bash
   git clone [https://github.com/nkepe/Nia-Platform.git](https://github.com/nkepe/Nia-Platform.git)
   cd Nia-Platform
   
---

## Administrative Controls & Governance

The platform implements a multi-tier authorization and administrative oversight framework designed to safeguard data integrity and moderate platform activity:

### 1. Dual-Layer Privilege Verification
Administrative access is enforced through both client-side route guards and database-level security policies:
* **Identity Whitelisting:** Client routing checks verify active user emails against a secure list (`ADMIN_EMAILS`) alongside a database check on `profiles.role = 'admin'`.
* **Dynamic Navigation Exposure:** Privileged navigation elements (e.g., direct routing to `admin.html`) remain hidden from standard student accounts and are only injected upon verified administrative authentication.
* **Unauthorized Access Redirection:** Unprivileged users attempting direct URL manipulation to administrative pages are redirected to the student feed with session logging.

### 2. Opportunity Lifecycle Management
Administrators possess complete CRUD (Create, Read, Update, Delete) governance over job and attachment listings:
* **Publishing Engine:** Direct intake form validating role title, hosting company, work arrangement (Attachment, Internship, Full-time, Part-time), geographic location, and comprehensive job requirements.
* **In-Place Modification:** Modal-driven update interfaces allowing real-time edits to active job descriptions, requirements, and locations without record re-creation.
* **Cascading Teardown:** Opportunity pruning utilizes relational foreign key cascades (`ON DELETE CASCADE`), automatically clearing obsolete applicant submissions linked to deleted opportunities.

### 3. Application Review & Resume Auditing
* **Centralized Intake Monitoring:** Consolidated table displaying applicant emails, targeted positions, hiring organizations, and submission timestamps.
* **Direct Document Preview:** In-line integration with Supabase Storage enabling one-click opening and review of uploaded student CVs/Resumes in standard document formats (PDF/DOCX).
* **Record Sanitization:** Selective deletion of individual applicant records with confirmation guards to prevent accidental data loss.

### 4. Account Moderation & Suspension Lifecycle
* **Soft Ban (Suspension):** Status toggling (`active` vs. `banned`) on student profiles. Banned accounts are intercepted during login and active sessions, immediately signed out, and presented with suspension advisories.
* **Database-Enforced Restriction:** PostgreSQL Row Level Security (RLS) rules evaluate account status to prevent banned identifiers from querying listings or inserting application rows.
* **Hard Purge (RPC Cascades):** Permanent user deletion utilizes an administrative PostgreSQL `SECURITY DEFINER` function (`delete_user_by_admin`). This completely eliminates the identity record from Supabase's internal authentication registry (`auth.users`), which automatically cascades to erase the public profile, storage bindings, and historical application submissions.

---

## Author & Academic Credits

* **Lead Architect & Developer:** David Kasimilu Nkepe
* **Institutional Affiliation:** Taita Taveta University (TTU)
* **Academic Program:** Diploma in Information Technology
* **Project Designation:** Academic Capstone Project Submission & Demonstration
* **Repository:** [github.com/nkepe/Nia-Platform](https://github.com/nkepe/Nia-Platform)
