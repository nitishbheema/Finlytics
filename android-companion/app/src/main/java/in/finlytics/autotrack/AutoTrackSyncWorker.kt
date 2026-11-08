package in.finlytics.autotrack

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class AutoTrackSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val prefs = applicationContext.getSharedPreferences("finlytics_autotrack", Context.MODE_PRIVATE)
        val baseUrl = prefs.getString("base_url", "https://finlytics-ten.vercel.app")?.trimEnd('/') ?: return@withContext Result.failure()
        val token = SecureTokenStore(applicationContext).readToken() ?: return@withContext Result.failure()
        val encryptedEvent = inputData.getString("event_cipher") ?: return@withContext Result.failure()
        val eventJson = SecureTokenStore(applicationContext).decryptText(encryptedEvent) ?: return@withContext Result.failure()
        var connection: HttpURLConnection? = null
        try {
            connection = (URL("$baseUrl/api/autotrack/events").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 12000
                readTimeout = 12000
                doOutput = true
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
            val body = JSONObject().put("events", JSONArray().put(JSONObject(eventJson))).toString()
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            if (status in 200..299) Result.success()
            else if (status >= 500 || status == 429) Result.retry()
            else Result.failure()
        } catch (_: Exception) {
            Result.retry()
        } finally {
            connection?.disconnect()
        }
    }
}
