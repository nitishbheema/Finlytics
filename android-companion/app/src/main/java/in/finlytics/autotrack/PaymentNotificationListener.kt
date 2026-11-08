package in.finlytics.autotrack

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import org.json.JSONObject
import java.security.MessageDigest
import java.util.Date

class PaymentNotificationListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val prefs = getSharedPreferences("finlytics_autotrack", MODE_PRIVATE)
        if (!prefs.getBoolean("privacy_consent", false)) return
        val selected = prefs.getStringSet("selected_packages", emptySet()) ?: emptySet()
        if (sbn.packageName !in selected) return
        if (SecureTokenStore(this).readToken().isNullOrBlank()) return

        val extras = sbn.notification?.extras ?: return
        val parts = mutableListOf<String>()
        extras.getCharSequence("android.title")?.toString()?.let(parts::add)
        extras.getCharSequence("android.text")?.toString()?.let(parts::add)
        extras.getCharSequence("android.bigText")?.toString()?.let(parts::add)
        extras.getCharSequenceArray("android.textLines")?.forEach { parts.add(it.toString()) }
        val rawInMemory = parts.joinToString(" ").take(4000)
        val parsed = NotificationTransactionParser.parse(rawInMemory, sbn.postTime) ?: return

        // Only normalized transaction fields leave the phone. Never send rawInMemory or notification extras.
        val event = JSONObject()
            .put("amount", parsed.amount)
            .put("direction", parsed.direction)
            .put("merchant", parsed.merchant)
            .put("reference", parsed.reference ?: JSONObject.NULL)
            .put("transactionDate", parsed.transactionDate)
            .put("occurredAt", parsed.occurredAt)
            .put("sourceApp", sbn.packageName)

        val identity = parsed.reference ?: "${sbn.packageName}|${parsed.amount}|${parsed.direction}|${parsed.transactionDate}|${parsed.merchant}|${sbn.postTime / 60000}"
        val uniqueSuffix = sha256(identity)
        val encryptedEvent = SecureTokenStore(this).encryptText(event.toString())
        val work = OneTimeWorkRequestBuilder<AutoTrackSyncWorker>()
            .setInputData(workDataOf("event_cipher" to encryptedEvent))
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(this).enqueueUniqueWork("autotrack-$uniqueSuffix", ExistingWorkPolicy.KEEP, work)
    }

    private fun sha256(text: String): String {
        return MessageDigest.getInstance("SHA-256").digest(text.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }
}
