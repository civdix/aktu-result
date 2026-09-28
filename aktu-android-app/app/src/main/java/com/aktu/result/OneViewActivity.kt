package com.aktu.result

import android.annotation.SuppressLint
import android.content.Context
import android.os.Bundle
import android.print.PrintAttributes
import android.print.PrintManager
import android.util.Log
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.aktu.result.databinding.ActivityOneviewBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class OneViewActivity : AppCompatActivity() {

    private lateinit var binding: ActivityOneviewBinding
    private var rollNumber: String = ""
    private var studentDob: String = ""
    private var studentName: String = ""
    private var lastCaptchaToken: String = ""
    private var isResultRendered: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityOneviewBinding.inflate(layoutInflater)
        setContentView(binding.root)

        rollNumber = intent.getStringExtra("ROLL_NUMBER") ?: ""
        studentDob = intent.getStringExtra("STUDENT_DOB") ?: ""
        studentName = intent.getStringExtra("STUDENT_NAME") ?: ""

        setupToolbar()
        setupWebView()

        binding.btnPrintPdf.setOnClickListener {
            printCurrentMarksheet()
        }

        binding.webView.loadUrl("https://oneview.aktu.ac.in/WebPages/aktu/OneView.aspx")
    }

    private fun setupToolbar() {
        binding.toolbar.title = if (studentName.isNotEmpty()) "$studentName ($rollNumber)" else "AKTU OneView: $rollNumber"
        binding.toolbar.setNavigationOnClickListener {
            finish()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val webSettings: WebSettings = binding.webView.settings
        webSettings.javaScriptEnabled = true
        webSettings.domStorageEnabled = true
        webSettings.databaseEnabled = true
        webSettings.loadWithOverviewMode = true
        webSettings.useWideViewPort = true
        webSettings.builtInZoomControls = true
        webSettings.displayZoomControls = false
        webSettings.setSupportZoom(true)

        // Use authentic Chrome User-Agent for highest Google reCAPTCHA trust score
        val defaultUa = webSettings.userAgentString
        webSettings.userAgentString = defaultUa.replace("; wv", "")

        binding.webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

        binding.webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    binding.webProgressBar.visibility = View.VISIBLE
                    binding.webProgressBar.progress = newProgress
                } else {
                    binding.webProgressBar.visibility = View.GONE
                }
            }
        }

        binding.webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                injectAutofillScript()
            }
        }
    }

    private fun injectAutofillScript() {
        val js = """
            (function() {
                var targetRoll = '$rollNumber';
                var targetDob = '$studentDob';

                function log(msg) {
                    if (window.AndroidBridge) {
                        window.AndroidBridge.logMessage(msg);
                    }
                }

                // Check if result has already loaded on the page
                function checkAndFormatResult() {
                    var fullNameEl = document.getElementById('lblFullName');
                    var rollEl = document.getElementById('lblRollNo');
                    var summaryPanel = document.getElementById('pnlFinalResultSummary');
                    var accordions = document.querySelectorAll('.contentclass');

                    if ((fullNameEl && fullNameEl.innerText.trim().length > 0) || 
                        (summaryPanel && summaryPanel.offsetParent !== null) || 
                        (accordions && accordions.length > 0)) {

                        if (!window.__aktu_result_formatted) {
                            window.__aktu_result_formatted = true;
                            window.__aktu_automation_done = true;

                            // 1. Automatically expand all semester marksheets
                            document.querySelectorAll('.contentclass').forEach(function(el) {
                                el.style.setProperty('display', 'block', 'important');
                                el.style.setProperty('visibility', 'visible', 'important');
                                el.style.setProperty('height', 'auto', 'important');
                                el.style.setProperty('max-height', 'none', 'important');
                                el.style.setProperty('opacity', '1', 'important');
                            });

                            // 2. Hide raw desktop input controls & buttons
                            var elementsToHide = [
                                document.getElementById('txtRollNo')?.closest('table'),
                                document.getElementById('txtDOB')?.closest('table'),
                                document.getElementById('btnProceed'),
                                document.getElementById('btnSearch'),
                                document.getElementById('divCap'),
                                document.querySelector('.g-recaptcha')
                            ];
                            elementsToHide.forEach(function(el) {
                                if (el) el.style.setProperty('display', 'none', 'important');
                            });

                            // 3. Inject sleek mobile result styling
                            if (!document.getElementById('aktu-mobile-result-theme')) {
                                var style = document.createElement('style');
                                style.id = 'aktu-mobile-result-theme';
                                style.innerHTML = `
                                    body {
                                        background-color: #0F172A !important;
                                        color: #F8FAFC !important;
                                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
                                        padding: 10px 8px !important;
                                        margin: 0 !important;
                                    }
                                    .headerclass {
                                        background: linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%) !important;
                                        color: #FFFFFF !important;
                                        padding: 12px 14px !important;
                                        border-radius: 10px !important;
                                        font-weight: 700 !important;
                                        font-size: 13px !important;
                                        margin: 14px 0 6px 0 !important;
                                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3) !important;
                                        display: flex !important;
                                        align-items: center !important;
                                        justify-content: space-between !important;
                                        cursor: pointer !important;
                                    }
                                    .headerclass a, .headerclass span {
                                        color: #FFFFFF !important;
                                        text-decoration: none !important;
                                    }
                                    .contentclass {
                                        display: block !important;
                                        visibility: visible !important;
                                        height: auto !important;
                                        max-height: none !important;
                                        opacity: 1 !important;
                                        padding: 0 !important;
                                        margin-bottom: 12px !important;
                                    }
                                    table {
                                        width: 100% !important;
                                        max-width: 100% !important;
                                        border-collapse: separate !important;
                                        border-spacing: 0 !important;
                                        background-color: #1E293B !important;
                                        border-radius: 10px !important;
                                        overflow: hidden !important;
                                        margin: 6px 0 12px 0 !important;
                                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                                    }
                                    th {
                                        background-color: #0F172A !important;
                                        color: #93C5FD !important;
                                        font-size: 11px !important;
                                        font-weight: 600 !important;
                                        padding: 8px 6px !important;
                                        text-align: center !important;
                                        border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
                                    }
                                    td {
                                        padding: 7px 6px !important;
                                        font-size: 11px !important;
                                        color: #E2E8F0 !important;
                                        border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
                                        text-align: center !important;
                                    }
                                    #pnlFinalResultSummary {
                                        background: linear-gradient(180deg, #1E293B 0%, #0F172A 100%) !important;
                                        border: 1px solid rgba(59, 130, 246, 0.3) !important;
                                        border-radius: 12px !important;
                                        padding: 14px !important;
                                        margin: 16px 0 !important;
                                        color: #F8FAFC !important;
                                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
                                    }
                                    #pnlStudent, #pnlCandidateDetails {
                                        background-color: #1E293B !important;
                                        border: 1px solid rgba(255, 255, 255, 0.1) !important;
                                        border-radius: 12px !important;
                                        padding: 12px !important;
                                        margin-bottom: 12px !important;
                                    }
                                `;
                                document.head.appendChild(style);
                            }

                            // 4. Extract student info and notify native layer
                            var sName = fullNameEl?.innerText?.trim() || '';
                            var sRoll = rollEl?.innerText?.trim() || targetRoll;
                            var sCourse = document.getElementById('lblBranch')?.innerText?.trim() || document.getElementById('lblCourse')?.innerText?.trim() || '';
                            var sInstitute = document.getElementById('lblCollegeName')?.innerText?.trim() || '';
                            var sDiv = document.querySelector('[id*="lblDivision"]')?.innerText?.trim() || '';

                            if (window.AndroidBridge) {
                                window.AndroidBridge.onResultLoaded(sName, sRoll, sCourse, sInstitute, sDiv);
                            }

                            var targetCard = document.getElementById('pnlStudent') || fullNameEl || document.querySelector('.headerclass');
                            if (targetCard) targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                        return true;
                    }
                    return false;
                }

                function tick() {
                    // Check if marksheet has loaded
                    if (checkAndFormatResult()) return;
                    if (window.__aktu_automation_done) return;

                    var rollInp = document.getElementById('txtRollNo');
                    var btnProceed = document.getElementById('btnProceed');
                    var dobInp = document.getElementById('txtDOB') || document.querySelector("input[name*='txtDOB']");
                    var btnSearch = document.getElementById('btnSearch');
                    var recaptchaResp = document.getElementById('g-recaptcha-response');

                    // Step 1: Autofill Roll Number & Click Proceed
                    if (rollInp && btnProceed && (!dobInp || dobInp.offsetParent === null)) {
                        if (rollInp.value !== targetRoll) {
                            rollInp.value = targetRoll;
                            btnProceed.click();
                            log('Step 1: Roll number autofilled, proceeding...');
                        }
                    }

                    // Step 2: Autofill DOB
                    if (dobInp && dobInp.offsetParent !== null) {
                        if (targetDob && dobInp.value !== targetDob) {
                            dobInp.value = targetDob;
                            dobInp.dispatchEvent(new Event('input', { bubbles: true }));
                            dobInp.dispatchEvent(new Event('change', { bubbles: true }));
                            log('Step 2: DOB autofilled! Tap the checkbox below.');
                            if (window.AndroidBridge) window.AndroidBridge.onDobFilled();
                        } else if (!targetDob && !window.__dob_prompted) {
                            window.__dob_prompted = true;
                            if (window.AndroidBridge) window.AndroidBridge.onPromptDob();
                        }
                    }

                    // Step 3: Automatically capture reCAPTCHA token & submit
                    if (recaptchaResp && recaptchaResp.value && recaptchaResp.value.length > 20 && btnSearch) {
                        if (!window.__aktu_submitted) {
                            window.__aktu_submitted = true;
                            var solvedToken = recaptchaResp.value;
                            var actualDob = (dobInp && dobInp.value) ? dobInp.value : targetDob;
                            log('Step 3: CAPTCHA verified! Token obtained, auto-submitting...');
                            if (window.AndroidBridge) {
                                window.AndroidBridge.onCaptchaSolved(solvedToken, targetRoll, actualDob);
                                window.AndroidBridge.onAutoSubmit();
                            }
                            btnSearch.click();
                        }
                    }
                }

                if (window.__aktu_loop) clearInterval(window.__aktu_loop);
                window.__aktu_loop = setInterval(tick, 300);
                tick();
            })();
        """.trimIndent()

        binding.webView.evaluateJavascript(js, null)
    }

    private fun printCurrentMarksheet() {
        val printManager = getSystemService(Context.PRINT_SERVICE) as? PrintManager
        if (printManager != null) {
            val printAdapter = binding.webView.createPrintDocumentAdapter("AKTU_Result_$rollNumber")
            printManager.print("AKTU_Result_$rollNumber", printAdapter, PrintAttributes.Builder().build())
        } else {
            Toast.makeText(this, "Printing service unavailable", Toast.LENGTH_SHORT).show()
        }
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun onDobFilled() {
            runOnUiThread {
                binding.bannerText.text = "✓ DOB Autofilled! Tap 'I'm not a robot' to view result."
                binding.statusBarBanner.setBackgroundColor(ContextCompat.getColor(this@OneViewActivity, R.color.brand_primary))
            }
        }

        @JavascriptInterface
        fun onPromptDob() {
            runOnUiThread {
                binding.bannerText.text = "Please enter your Date of Birth & tap 'I'm not a robot'"
                binding.statusBarBanner.setBackgroundColor(ContextCompat.getColor(this@OneViewActivity, R.color.brand_primary))
            }
        }

        @JavascriptInterface
        fun onCaptchaSolved(token: String, roll: String, dob: String) {
            lastCaptchaToken = token
            Log.d("OneViewActivity", "CAPTCHA token captured for roll $roll: ${token.take(20)}...")
            // Background sync with API so student result is cached for future 1-tap retrieval
            lifecycleScope.launch(Dispatchers.IO) {
                try {
                    DobApiService.syncCaptchaToken(roll, dob, token)
                } catch (e: Exception) {
                    Log.w("OneViewActivity", "Token sync notice: ${e.message}")
                }
            }
        }

        @JavascriptInterface
        fun onAutoSubmit() {
            runOnUiThread {
                binding.bannerText.text = "⚡ CAPTCHA Solved! Generating automatic result view..."
                binding.statusBarBanner.setBackgroundColor(ContextCompat.getColor(this@OneViewActivity, R.color.brand_primary_dark))
            }
        }

        @JavascriptInterface
        fun onResultLoaded(name: String, roll: String, course: String, institute: String, division: String) {
            runOnUiThread {
                isResultRendered = true
                val displayName = if (name.isNotBlank()) name else (studentName.ifBlank { "AKTU Student" })
                val divTag = if (division.isNotBlank()) " • $division" else ""
                val courseTag = if (course.isNotBlank()) " ($course)" else ""

                binding.bannerText.text = "🎓 $displayName$courseTag$divTag"
                binding.statusBarBanner.setBackgroundColor(ContextCompat.getColor(this@OneViewActivity, R.color.brand_accent))
                binding.toolbar.title = "Result: $displayName"
                binding.btnPrintPdf.visibility = View.VISIBLE

                Toast.makeText(this@OneViewActivity, "✓ Marksheet loaded! All semesters expanded.", Toast.LENGTH_SHORT).show()

                // Cache student details locally
                getSharedPreferences("aktu_results", Context.MODE_PRIVATE).edit()
                    .putString("last_roll", roll)
                    .putString("last_name", displayName)
                    .putString("last_course", course)
                    .apply()
            }
        }

        @JavascriptInterface
        fun logMessage(msg: String) {
            Log.d("OneViewActivity", msg)
        }
    }

    override fun onBackPressed() {
        if (binding.webView.canGoBack()) {
            binding.webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
