package com.aktu.result

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

object DobApiService {

    // Production backend endpoint on akturesult.bond
    var BASE_URL = "https://akturesult.bond/api/dob"

    data class DobResult(
        val success: Boolean,
        val dob: String? = null,
        val name: String? = null,
        val course: String? = null,
        val institute: String? = null,
        val cgpa: String? = null,
        val divisionAwarded: String? = null,
        val hasSemesters: Boolean = false,
        val error: String? = null
    )

    suspend fun findDob(rollNumber: String): DobResult = withContext(Dispatchers.IO) {
        try {
            val url = URL(BASE_URL)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            conn.connectTimeout = 15000
            conn.readTimeout = 20000
            conn.doOutput = true

            val jsonBody = JSONObject().apply {
                put("rollNumber", rollNumber)
            }

            OutputStreamWriter(conn.outputStream).use { writer ->
                writer.write(jsonBody.toString())
                writer.flush()
            }

            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val reader = BufferedReader(InputStreamReader(stream))
            val sb = StringBuilder()
            var line: String?
            while (reader.readLine().also { line = it } != null) {
                sb.append(line)
            }
            reader.close()

            val responseJson = JSONObject(sb.toString())
            if (responseJson.optBoolean("success", false)) {
                val sems = responseJson.optJSONArray("semesters")
                DobResult(
                    success = true,
                    dob = responseJson.optString("dob", null),
                    name = responseJson.optString("name", null),
                    course = responseJson.optString("course", null),
                    institute = responseJson.optString("institute", null),
                    cgpa = responseJson.optString("cgpa", null),
                    divisionAwarded = responseJson.optString("divisionAwarded", null),
                    hasSemesters = sems != null && sems.length() > 0
                )
            } else {
                DobResult(
                    success = false,
                    error = responseJson.optString("error", "Could not locate Date of Birth.")
                )
            }
        } catch (e: Exception) {
            DobResult(
                success = false,
                error = e.localizedMessage ?: "Network error connecting to verification engine."
            )
        }
    }

    suspend fun syncCaptchaToken(rollNumber: String, dob: String, token: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val url = URL(BASE_URL)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            conn.connectTimeout = 10000
            conn.readTimeout = 15000
            conn.doOutput = true

            val jsonBody = JSONObject().apply {
                put("rollNumber", rollNumber)
                put("dob", dob)
                put("gRecaptchaResponse", token)
            }

            OutputStreamWriter(conn.outputStream).use { writer ->
                writer.write(jsonBody.toString())
                writer.flush()
            }

            val code = conn.responseCode
            code in 200..299
        } catch (e: Exception) {
            false
        }
    }
}
