# 🎓 AKTU Result Without DOB & Roll Number Finder

[![Website](https://img.shields.io/badge/Live-akturesult.bond-blue?style=flat-square&logo=google-chrome)](https://akturesult.bond)
[![Astro](https://img.shields.io/badge/Astro-v5-FF5D01?style=flat-square&logo=astro)](https://astro.build)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.0.0-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Cloudflare](https://img.shields.io/badge/CDN-Cloudflare-F38020?style=flat-square&logo=cloudflare)](https://cloudflare.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

A high-performance, student-centric academic assistant web portal for **Dr. A.P.J. Abdul Kalam Technical University (AKTU / UPTU)** students.

Retrieve complete semester marksheets and One View scorecards without needing a Date of Birth, find university roll numbers across **865+ affiliated colleges** and **143+ engineering/management branches**, interact with an automated Telegram bot assistant, and access programmatic developer REST APIs.

---

## 🚀 Live Demo & Production

* **Official Portal**: [https://akturesult.bond](https://akturesult.bond)
* **Telegram Bot**: [@akturesultwithoutdobbot](https://t.me/akturesultwithoutdobbot)

---

## ✨ Key Features

- ⚡ **Result Retrieval Without DOB**: Query official semester grade sheets, SGPA, CGPA, and subject-wise marks using only a University Roll Number via ASP.NET session state management.
- 🔍 **Class Roll Number Finder**: Advanced name-based student roster lookup supporting all admission years (2018–2025), college codes, and branch courses.
- 🏛️ **Affiliated Colleges Directory**: Comprehensive profiles for 865+ AKTU institutions with official college codes, ERP identifiers, verified campus addresses, and pincodes.
- 🤖 **Telegram Bot Integration**: Embedded 24/7 Telegram bot listener powered by Grammy for fast roll lookups and instant result alerts.
- 🔌 **Developer REST API**: Clean endpoints for public result searches, college directories, and private whitelisted DOB recovery.
- 🧹 **Automated Cloudflare Edge Purge**: Built-in post-deployment hook that automatically purges Cloudflare CDN cache the moment the new server boots on Render.
- 📱 **Apple-Inspired Glassmorphism UI**: High-contrast, responsive interface with Dark and Light mode themes, zero DOM layout thrashing, and optimized TTFB (< 50ms).
- 📈 **SEO & Schema.org Rich Snippets**: Fully automated XML sitemaps (`/sitemap.xml`, `/sitemap-colleges.xml`), Google-compliant `FAQPage`, `CollegeOrUniversity`, and `BreadcrumbList` microdata.

---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Framework** | [Astro](https://astro.build/) (Server-Side Rendering mode with `@astrojs/node` standalone adapter) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) with custom Apple-style glassmorphism utilities |
| **Runtime** | [Node.js](https://nodejs.org/) `>= 22.0.0` with ESM modules |
| **Language** | [TypeScript](https://www.typescriptlang.org/) |
| **Scraping & State Engine** | [Axios](https://axios-http.com/), [Cheerio](https://cheerio.js.org/), ASP.NET ViewState / Session tokens |
| **Database** | [MongoDB](https://www.mongodb.com/) (student records, cached roll ranges) |
| **Bot Service** | [Grammy](https://grammy.dev/) Telegram Bot Framework |
| **Edge & CDN** | [Cloudflare](https://www.cloudflare.com/) (Reverse Proxy, SSL, Edge Caching, Automated Cache Purge) |

---

## 📁 Repository Structure

```text
├── public/
│   ├── favicon.svg             # Brand icons & PWA assets
│   ├── robots.txt              # Search engine directives & sitemap references
│   └── sitemap.xml             # Static pages XML sitemap
├── src/
│   ├── bot/
│   │   └── telegram.ts         # Telegram bot handler (Grammy)
│   ├── data/
│   │   ├── AKTUCollege.json    # Verified college addresses, pincodes & codes
│   │   ├── colleges.json       # 865 affiliated colleges index
│   │   ├── branches.json       # 143 technical & management courses
│   │   └── courses.json        # Academic degree types (B.Tech, MBA, MCA, etc.)
│   ├── layouts/
│   │   └── Layout.astro        # Base HTML layout, SEO headers, modals & analytics
│   ├── middleware/
│   │   ├── cache.ts            # Edge cache-control & charset=utf-8 headers
│   │   └── canonical.ts        # Canonical domain normalization
│   ├── pages/
│   │   ├── api/                # REST endpoints (colleges, branches, find-roll, search, dob)
│   │   ├── college/
│   │   │   └── [slug].astro    # Dedicated SEO landing pages for each college
│   │   ├── colleges.astro      # Searchable directory of 865+ colleges
│   │   ├── index.astro         # Homepage (Hero, Check Result, Roll Finder, Share)
│   │   ├── roll-number-finder.astro # Standalone Roll Finder application
│   │   ├── sitemap-colleges.xml.ts  # Dynamic programmatic XML sitemap (865 URLs)
│   │   └── sitemap_colleges.xml.ts  # Compatibility alias endpoint
│   ├── services/
│   │   └── engine.service.ts   # Core AKTU scraper & ASP.NET session resolver
│   ├── server.ts               # Unified production entrypoint (Bot + Astro + Cloudflare hook)
│   └── utils/
│       └── slugify.ts          # URL-friendly slug generator for colleges
├── .github/
│   └── workflows/
│       ├── purge-cloudflare.yml # Cloudflare cache purge GitHub Action
│       └── build-apk.yml        # Android build workflow
├── package.json
└── astro.config.mjs
```

..

---

## ⚙️ Getting Started

### Prerequisites

* **Node.js**: `v22.0.0` or higher
* **npm** / **pnpm** / **yarn**
* **MongoDB**: A local or cloud MongoDB cluster (MongoDB Atlas)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/aktu-result.git
   cd aktu-result
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory:
   ```env
   # Server Port & Binding
   HOST=0.0.0.0
   PORT=10000

   # Database
   MONGO_DB_URI="mongodb+srv://<username>:<password>@cluster.mongodb.net/..."
   DATABASE_NAME="AKTU_RESULTS"

   # Telegram Bot
   TELEGRAM_BOT_TOKEN="your_telegram_bot_token"

   # Cloudflare Automated Cache Purge
   CLOUDFLARE_ZONE_ID="your_cloudflare_zone_id"
   CLOUDFLARE_API_TOKEN="your_cloudflare_api_token"

   # Verification Keys
   ADMIN_PASSWORD="your_admin_secret"
   CAPTCHA_API_KEY="your_captcha_service_key"
   ```

---

## 🏃 Running the Application

### Development Mode
Starts the local Astro development server with Hot Module Reloading:
```bash
npm run dev
# Running on http://localhost:4321
```

### Production Build
Compiles the client assets and server-side bundle:
```bash
npm run build
```

### Start Production Server
Launches the unified full-stack server (Astro Web Server + APIs + Telegram Bot):
```bash
npm start
# Unified server listening on http://0.0.0.0:10000
```

### Manual Cloudflare Edge Purge
Instantly purge the live Cloudflare CDN cache from the terminal:
```bash
npm run purge
```

---

## 📡 REST API Reference

| Endpoint | Method | Description | Access |
| :--- | :---: | :--- | :---: |
| `/api/search` | `POST` | Fetches full academic marksheet by roll number without DOB | Public |
| `/api/colleges` | `GET` | Returns list of affiliated colleges (supports `?q=` and pagination) | Public |
| `/api/branches` | `GET` | Returns list of engineering and management branch courses | Public |
| `/api/find-roll` | `POST` | Queries roll numbers and class rosters by year, college, and branch | Public (Captcha) |
| `/api/dob` | `POST` | Locates student Date of Birth using automated range verification | Protected / Whitelisted |

---

## 🔒 Security & Privacy Notice

* **No Credential Logging**: Student marksheets and personal data are never permanently stored, harvested, or shared with third parties.
* **Transient Session Validation**: The portal programmatically communicates with official university endpoints using temporary ASP.NET session tokens solely to present academic records to the student.
* **Educational Purpose**: Built strictly as an educational accessibility and helper utility for university students.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
