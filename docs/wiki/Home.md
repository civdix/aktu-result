# 🎓 Welcome to the AKTU Result Portal Wiki

Welcome to the comprehensive technical documentation for **AKTU Result Without DOB & Roll Number Finder** ([akturesult.bond](https://akturesult.bond)).

This documentation covers the system architecture, automated scraping pipelines, AI-driven circular journalism engine, search engine optimization standards, A2A agent interfaces, Android mobile client, and edge deployment practices.

---

## 📌 Quick Overview

| Metric / Parameter | Value / Details |
| :--- | :--- |
| **Production Domain** | `https://akturesult.bond` |
| **Framework** | Astro 5 SSR (Standalone Node.js Adapter) |
| **Edge & CDN** | Cloudflare Enterprise Network (Global Caching & SSL) |
| **Databases** | MongoDB (Student records, Article archives), Redis (Live counters, Views) |
| **Supported Colleges** | 865+ Affiliated Technical & Management Colleges |
| **Supported Courses** | 143+ Branches (B.Tech, B.Pharma, MBA, MCA, M.Tech, etc.) |
| **Native Mobile Client** | Android Native (Kotlin + WebView + AndroidBridge) |

---

## 📚 Wiki Sections

Explore the key architectural components:

1. **[Architecture & Tech Stack](Architecture-&-Tech-Stack)**: Full-stack topology, directory structure, data layers, and component flow.
2. **[Result Engine & OneView Automation](Result-Engine-&-OneView-Automation)**: How the server resolves ASP.NET ViewState sessions, bypasses missing DOBs, and renders marksheets.
3. **[SEO, Sitemaps & Robots Protocol](SEO-Sitemaps-&-Robots-Protocol)**: RFC 9309 robots.txt specification, AI opt-outs, Google News sitemap standards, and canonical management.
4. **[Automated News Pipeline](Automated-News-Pipeline)**: YouTube transcript extraction, Groq/Gemini LLM synthesis, IndexNow pinging, and anti-spam measures.
5. **[REST API & A2A Protocols](REST-API-&-A2A-Agent-Protocols)**: Developer REST endpoints, RFC 9727 API catalog, AP2 extensions, and Agent-to-Agent (`/a2a`) interface.
6. **[Android App & CI/CD](Android-App-&-CI-CD)**: Native app lifecycle, bidirectional JavaScript bridge, auto-submitting CAPTCHA tokens, and GitHub Actions APK build automation.
7. **[Cloudflare Deployment & Caching](Cloudflare-Deployment-&-Caching)**: Edge caching rules, cache purges on deploy, WAF configurations, and 4xx optimization.

---

## 🚀 Key Production Endpoints

* **Homepage**: `https://akturesult.bond/`
* **Result Without DOB**: `https://akturesult.bond/aktu-result-without-date-of-birth`
* **OneView Portal**: `https://akturesult.bond/oneview`
* **Roll Number Finder**: `https://akturesult.bond/roll-number-finder`
* **College Directory**: `https://akturesult.bond/colleges`
* **News & Circular Hub**: `https://akturesult.bond/news`
* **Robots Directives**: `https://akturesult.bond/robots.txt`
* **Core Sitemap**: `https://akturesult.bond/sitemap.xml`
* **College Sitemap**: `https://akturesult.bond/sitemap-colleges.xml`
* **Google News Sitemap**: `https://akturesult.bond/sitemap-news.xml`
* **A2A Agent Interface**: `https://akturesult.bond/a2a`
* **Agent Discovery Card**: `https://akturesult.bond/.well-known/agent-card.json`
