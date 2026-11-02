# DEVTHON BUILD CHALLENGE - COMPANY X SPECIFICATIONS

## 01 • Welcome
Client: Company X
Build: Customer feedback system people actually enjoy using.
Core Stack: Next.js, FastAPI, Postgres, CI/CD
Bonus Goals: AI integrations, SMS capabilities, "Wow" UI styling.

## 02 • The Client Profile
- Company X makes and sells paint.
- Wants to know what customers say about its product and customer care.
- Has two types of customers: Homeowners buying paint, and Professional Painters.
- Wants a digital feedback system customers can use directly from their own phones.
- Constraint: Some professional painters use basic feature phones (J2ME keys); others use smartphones.

## 03 • The User Personas
- Persona 01 (The Paint Buyer): Has a house they want painted. Usually on a smartphone. Needs a quick, friendly web form finished in under a minute.
- Persona 02 (The Painter): Paints for a living. May carry a basic feature phone. Design for feedback that works without an app or a mobile data bundle.

## 04 • Core Architectural Tasks
Build a robust web app on Next.js, Python (FastAPI/Django), and PostgreSQL, shipped through a real CI/CD pipeline — plus your own creative and AI touch.

## 05 • Full Technical Stack Requirements
- Front End: Next.js (React, TypeScript) -> Questionnaire with stars/smileys, admin insights dashboard.
- Back End: Python (FastAPI or Django) -> API endpoints, scoring logic, email, and in-app notifications.
- Database: PostgreSQL -> Customers data, responses tracking, alerts system with schema migrations.
- SMS: Africa’s Talking sandbox -> Automated alerts by SMS to reach feature-phone users.
- CI/CD: GitHub Actions or GitLab CI -> Lint checker, test runner, build Docker images, production staging.
- AI Layer (Bonus): Sentiment tracking, automated summaries, smart email reply drafts.

## 06 • The Full Pipeline Sequence
01. Commit (branch -> PR)
02. Lint (ESLint for frontend, Ruff for backend Python)
03. Test (Vitest for frontend, pytest for backend)
04. Build (Docker images)
05. Scan (dependencies & secrets check)
06. Migrate (Postgres schema database updates)
07. Staging (auto-deploy environment)
08. Production (manual manager approval gate)

## 07 • The Questionnaire Layout
Three sequential screens/questions utilizing a 1–5 scale shown as stars or animated smileys:
- Q1: Rate your experience with our product.
- Q2: Rate our customer care.
- Q3: Are you happy with the product?
- Data Collection: Capture customer Name, Email, and Phone Number.

## 08 • Scoring Mechanism & Verdicts
Take the exact mathematical mean (average) of the three answers, then classify the customer category:
- Mean < 3: DETRACTOR -> Triggers an instant alert notification.
- Mean = 3: PASSIVE -> Only an exact 3.00 average score.
- Mean > 3: PROMOTER -> Your loyal brand fans.
Example: (2 + 3 + 2) / 3 = 2.33 -> Detractor -> Fires automated alert!

## 09 • Automated Alerts Setup
1. Customer submits feedback.
2. Python API calculates the metric mean.
3. If mean is below 3, a Detractor ticket is generated.
4. Care representative immediately gets an email and a dashboard notification carrying the customer’s name and email for fast follow-up. (Bonus: Send via SMS too).

## 10 • Analytics Dashboard Requirements
The corporate dashboard requires these specific visual analytics modules:
- Total: Total number of respondents clearly highlighted as one big metric card at the top.
- Trend: Day-by-day historical score trend line and forward data projection.
- Split: Donut chart displaying the breakdown proportions of detractors, passives, and promoters.
- Drill-Down: Searchable logs of individual ratings to view precise 1-5 breakdowns per question for any single person.

## 11 • The SMS API Sandbox Integration
- Provider: Africa's Talking sandbox framework.
- Mechanics for feature phones: Send an SMS invite, and let painters reply directly via text with three digits separated by spaces (e.g., "4 5 4" representing answers to Q1, Q2, and Q3).

## 12 • The AI Features Rules
- Rule 01: Zero effort for the customer. AI processes behind the scenes.
- Rule 02: Human in the loop. AI drafts or suggests; the care rep reviews and clicks send.
- Rule 03: Fail gracefully. If the AI service fails, feedback must still save successfully.
- Rule 04: Keys stay secret. Call the AI from the Python API backend with keys hidden in a protected `.env` file, never directly from React.
- Options: Comment sentiment tagging, one-click plain English text logs summary, or automated smart reply drafts.

## 13 • Creative UI Guidelines
- Ratings that react visually as you interact.
- Memorable multi-screen animations or thank-you panels.
- Highly mobile-first thumb-sized interaction targets.
- Paint-inspired styling choices (swatches, brush strokes, clean theme toggle adjustments).