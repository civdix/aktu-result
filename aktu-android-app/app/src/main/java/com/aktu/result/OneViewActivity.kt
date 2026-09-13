package com.aktu.result

import android.annotation.SuppressLint
import android.content.Context
import android.os.Bundle
import android.print.PrintAttributes
import android.print.PrintManager
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.aktu.result.databinding.ActivityOneviewBinding

class OneViewActivity : AppCompatActivity() {

    private lateinit var binding: ActivityOneviewBinding
    private var rollNumber: String = ""
    private var studentDob: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityOneviewBinding.inflate(layoutInflater)
        setContentView(binding.root)

        rollNumber = intent.getStringExtra("ROLL_NUMBER") ?: ""
        studentDob = intent.getStringExtra("STUDENT_DOB") ?: ""

        setupToolbar()
        setupWebView()

        binding.btnPrintPdf.setOnClickListener {
            printCurrentMarksheet()
        }

        binding.webView.loadUrl("https://oneview.aktu.ac.in/WebPages/aktu/OneView.aspx")
    }

    private fun setupToolbar() {
        binding.toolbar.title = "AKTU OneView: $rollNumber"
        binding.toolbar.setNavigationOnClickListener {
            finish()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val webSettings: WebSettings = binding.webView.settings
        webSettings.javaScriptEnabled = true
        webSettings.domStorageEnabled = true
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
                if (window.__aktu_automation_running) return;
                window.__aktu_automation_running = true;

                var targetRoll = '$rollNumber';
                var targetDob = '$studentDob';

                function log(msg) {
                    if (window.AndroidBridge) {
                        window.AndroidBridge.logMessage(msg);
                    }
                }

                function tick() {
                    var rollInp = document.getElementById('txtRollNo');
                    var btnProceed = document.getElementById('btnProceed');
                    var dobInp = document.getElementById('txtDOB') || document.querySelector("input[name*='txtDOB']");
                    var btnSearch = document.getElementById('btnSearch');
                    var recaptchaResp = document.getElementById('g-recaptcha-response');

                    // Step 1: Autofill Roll Number & Proceed
                    if (rollInp && btnProceed && (!dobInp || dobInp.offsetParent === null)) {
                        if (rollInp.value !== targetRoll) {
                            rollInp.value = targetRoll;
                            btnProceed.click();
                            log('Step 1: Roll number autofilled, proceeding...');
                        }
                    }

                    // Step 2: Autofill DOB
                    if (dobInp && dobInp.offsetParent !== null && targetDob) {
                        if (dobInp.value !== targetDob) {
                            dobInp.value = targetDob;
                            dobInp.dispatchEvent(new Event('input', { bubbles: true }));
                            dobInp.dispatchEvent(new Event('change', { bubbles: true }));
                            log('Step 2: DOB autofilled! Tap the checkbox below.');
                            if (window.AndroidBridge) window.AndroidBridge.onDobFilled();
                        }
                    }

                    // Step 3: Automatically Click Search When reCAPTCHA is Solved
                    if (recaptchaResp && recaptchaResp.value && recaptchaResp.value.length > 20 && btnSearch) {
                        if (!window.__aktu_submitted) {
                            window.__aktu_submitted = true;
                            log('Step 3: CAPTCHA verified! Loading marksheets...');
                            if (window.AndroidBridge) window.AndroidBridge.onAutoSubmit();
                            btnSearch.click();
                        }
                    }
                }

                setInterval(tick, 400);
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
                binding.bannerText.text = "✓ DOB Autofilled! Please tap the 'I'm not a robot' box below."
                binding.statusBarBanner.setBackgroundColor(getColor(R.color.brand_accent))
            }
        }

        @JavascriptInterface
        fun onAutoSubmit() {
            runOnUiThread {
                binding.bannerText.text = "⚡ CAPTCHA Verified! Loading marksheets..."
                binding.statusBarBanner.setBackgroundColor(getColor(R.color.brand_primary))
            }
        }

        @JavascriptInterface
        fun logMessage(msg: String) {
            runOnUiThread {
                // optional toast or log
            }
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
