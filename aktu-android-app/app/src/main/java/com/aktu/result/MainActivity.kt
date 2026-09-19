package com.aktu.result

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.aktu.result.databinding.ActivityMainBinding
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.btnSubmit.setOnClickListener {
            val roll = binding.rollEditText.text?.toString()?.trim() ?: ""
            if (roll.length < 10) {
                binding.rollEditText.error = "Please enter a valid 10-14 digit roll number"
                return@setOnClickListener
            }

            startSearchProcess(roll)
        }

        binding.btnWhatsapp.setOnClickListener {
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://chat.whatsapp.com/LoCFMpg5yyHIkd3gcywACo"))
                startActivity(intent)
            } catch (e: Exception) {
                Toast.makeText(this, "Could not open WhatsApp link", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnTelegram.setOnClickListener {
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://t.me/+B1IibFFFftc0NjNl"))
                startActivity(intent)
            } catch (e: Exception) {
                Toast.makeText(this, "Could not open Telegram link", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun startSearchProcess(rollNumber: String) {
        binding.progressBar.visibility = View.VISIBLE
        binding.btnSubmit.isEnabled = false
        binding.statusMessage.text = "Querying AKTU database for verified Date of Birth..."
        binding.statusMessage.setTextColor(ContextCompat.getColor(this, R.color.brand_primary))

        lifecycleScope.launch {
            val res = DobApiService.findDob(rollNumber)
            binding.progressBar.visibility = View.GONE
            binding.btnSubmit.isEnabled = true

            if (res.success && !res.dob.isNullOrEmpty()) {
                binding.statusMessage.text = "✓ DOB Found: ${res.dob}! Launching OneView..."
                binding.statusMessage.setTextColor(ContextCompat.getColor(this, R.color.brand_accent))

                launchOneView(rollNumber, res.dob, res.name ?: "Student")
            } else {
                // If automated DOB discovery is temporarily busy, ask user for DOB or proceed to manual
                binding.statusMessage.text = "Automated DOB lookup unavailable. Opening OneView directly..."
                launchOneView(rollNumber, "", "")
            }
        }
    }

    private fun launchOneView(roll: String, dob: String, name: String) {
        val intent = Intent(this, OneViewActivity::class.java).apply {
            putExtra("ROLL_NUMBER", roll)
            putExtra("STUDENT_DOB", dob)
            putExtra("STUDENT_NAME", name)
        }
        startActivity(intent)
    }
}
