package in.finlytics.autotrack

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

class MainActivity : Activity() {
    private val knownSources = linkedMapOf(
        "Google Pay" to "com.google.android.apps.nbu.paisa.user",
        "PhonePe" to "com.phonepe.app",
        "Paytm" to "net.one97.paytm",
        "BHIM" to "in.org.npci.upiapp",
        "Amazon Pay" to "in.amazon.mShop.android.shopping",
        "ICICI iMobile" to "com.csam.icici.bank.imobile",
        "SBI UPI" to "com.sbi.upi",
        "CRED" to "com.dreamplug.androidapp",
        "MobiKwik" to "com.mobikwik_new",
        "Axis Mobile" to "com.axis.mobile",
        "Freecharge" to "com.freecharge.android",
    )
    private lateinit var baseUrlInput: EditText
    private lateinit var pairingCodeInput: EditText
    private lateinit var consentBox: CheckBox
    private lateinit var statusText: TextView
    private lateinit var sourceContainer: LinearLayout
    private lateinit var customPackageInput: EditText
    private val sourceChecks = mutableMapOf<String, CheckBox>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = getSharedPreferences("finlytics_autotrack", Context.MODE_PRIVATE)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(36, 28, 36, 36) }
        val scroller = ScrollView(this)
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(TextView(this).apply { text = "Finlytics AutoTrack"; textSize = 25f; setPadding(0, 0, 0, 8) })
        content.addView(TextView(this).apply {
            text = "Connect your Android phone to Finlytics. The companion watches only the apps you select and parses supported payment notifications on this device. It does not read SMS or collect UPI PINs, OTPs or bank passwords."
            textSize = 14f
        })

        baseUrlInput = EditText(this).apply {
            hint = "Finlytics website URL"
            setSingleLine(true)
            setText(prefs.getString("base_url", "https://finlytics-ten.vercel.app"))
        }
        content.addView(baseUrlInput)
        pairingCodeInput = EditText(this).apply { hint = "One-time pairing code from Finlytics web"; setSingleLine(true) }
        content.addView(pairingCodeInput)
        content.addView(Button(this).apply { text = "Pair this phone"; setOnClickListener { pairDevice() } })

        content.addView(TextView(this).apply { text = "Choose payment apps to monitor"; textSize = 18f; setPadding(0, 24, 0, 8) })
        val existing = prefs.getStringSet("selected_packages", emptySet()) ?: emptySet()
        sourceContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        knownSources.forEach { (label, packageName) -> addSourceCheckbox(sourceContainer, label, packageName, existing.contains(packageName)) }
        val customPackages = prefs.getStringSet("custom_packages", emptySet()) ?: emptySet()
        customPackages.forEach { packageName -> addSourceCheckbox(sourceContainer, packageName, packageName, existing.contains(packageName)) }
        content.addView(sourceContainer)
        customPackageInput = EditText(this).apply { hint = "Other UPI / bank app package ID (optional)"; setSingleLine(true) }
        content.addView(customPackageInput)
        content.addView(Button(this).apply {
            text = "Add another payment / bank app"
            setOnClickListener {
                val packageName = customPackageInput.text.toString().trim()
                if (!packageName.matches(Regex("[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)+"))) {
                    Toast.makeText(this@MainActivity, "Enter a valid Android package ID.", Toast.LENGTH_LONG).show()
                } else {
                    val updated = (prefs.getStringSet("custom_packages", emptySet()) ?: emptySet()).toMutableSet()
                    if (packageName !in knownSources.values) updated.add(packageName)
                    prefs.edit().putStringSet("custom_packages", updated).apply()
                    if (!sourceChecks.containsKey(packageName)) addSourceCheckbox(sourceContainer, packageName, packageName, true)
                    customPackageInput.text.clear()
                }
            }
        })
        content.addView(TextView(this).apply {
            text = "Some bank and UPI apps do not show transaction notifications, or hide amounts. Only apps you select are processed."
            textSize = 12f
        })

        consentBox = CheckBox(this).apply {
            text = "I consent to on-device processing of notifications from only the selected apps to detect payment details. Only parsed amount, date, direction, merchant, app ID and reference are synced; raw notification text is not uploaded."
            isChecked = prefs.getBoolean("privacy_consent", false)
            setOnCheckedChangeListener { _, checked -> prefs.edit().putBoolean("privacy_consent", checked).apply() }
        }
        content.addView(consentBox)
        content.addView(Button(this).apply { text = "Save app selection"; setOnClickListener { saveSelection() } })
        content.addView(Button(this).apply { text = "Open Android Notification Access settings"; setOnClickListener { openNotificationSettings() } })
        content.addView(Button(this).apply { text = "Disconnect this phone"; setOnClickListener { SecureTokenStore(this@MainActivity).clearToken(); statusText.text = "Device token removed from this phone. Also revoke it in Finlytics web." } })
        statusText = TextView(this).apply { textSize = 13f; setPadding(0, 20, 0, 0) }
        content.addView(statusText)
        content.addView(TextView(this).apply {
            text = "Important: Android Notification Access is powerful. Enable it only if you understand the disclosure above. Detection works only for future visible notifications, may miss payments, and is not a bank-verified statement. For dependable coverage, Finlytics will need an eligible Account Aggregator partner."
            textSize = 12f; setPadding(0, 24, 0, 0)
        })
        scroller.addView(content); root.addView(scroller); setContentView(root)
        updateStatus()
    }

    private fun addSourceCheckbox(container: LinearLayout, label: String, packageName: String, checked: Boolean) {
        if (sourceChecks.containsKey(packageName)) return
        val check = CheckBox(this).apply { text = label; isChecked = checked }
        sourceChecks[packageName] = check
        container.addView(check)
    }

    private fun saveSelection() {
        val selected = sourceChecks.filterValues { it.isChecked }.keys.toSet()
        getSharedPreferences("finlytics_autotrack", MODE_PRIVATE).edit().putStringSet("selected_packages", selected).apply()
        Toast.makeText(this, "App selection saved", Toast.LENGTH_SHORT).show()
    }

    private fun openNotificationSettings() {
        if (!consentBox.isChecked) {
            Toast.makeText(this, "Please read and accept the notification disclosure first.", Toast.LENGTH_LONG).show()
            return
        }
        saveSelection()
        startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    }

    private fun pairDevice() {
        val code = pairingCodeInput.text.toString().trim()
        val baseUrl = baseUrlInput.text.toString().trim().trimEnd('/')
        if (!baseUrl.startsWith("https://") || code.length < 20) {
            Toast.makeText(this, "Enter the HTTPS Finlytics URL and a valid pairing code.", Toast.LENGTH_LONG).show(); return
        }
        getSharedPreferences("finlytics_autotrack", MODE_PRIVATE).edit().putString("base_url", baseUrl).apply()
        Thread {
            var conn: HttpURLConnection? = null
            try {
                conn = (URL("$baseUrl/api/autotrack/pair").openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"; connectTimeout = 12000; readTimeout = 12000; doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                }
                val body = JSONObject().put("pairingCode", code).put("deviceName", android.os.Build.MODEL ?: "Android device").toString()
                conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                val response = JSONObject((if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream).bufferedReader().use { it.readText() })
                if (conn.responseCode in 200..299) {
                    SecureTokenStore(this).saveToken(response.getString("deviceToken"))
                    runOnUiThread { pairingCodeInput.text.clear(); updateStatus(); Toast.makeText(this, "Phone paired successfully", Toast.LENGTH_LONG).show() }
                } else {
                    val message = response.optString("message", "Pairing failed")
                    runOnUiThread { Toast.makeText(this, message, Toast.LENGTH_LONG).show() }
                }
            } catch (_: Exception) {
                runOnUiThread { Toast.makeText(this, "Could not reach Finlytics. Check the URL and internet connection.", Toast.LENGTH_LONG).show() }
            } finally { conn?.disconnect() }
        }.start()
    }

    private fun updateStatus() {
        val hasToken = !SecureTokenStore(this).readToken().isNullOrBlank()
        val component = ComponentName(this, PaymentNotificationListener::class.java).flattenToString()
        val enabled = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")?.contains(component) == true
        statusText.text = "Pairing: ${if (hasToken) "Connected" else "Not connected"}\nNotification access: ${if (enabled) "Enabled" else "Not enabled"}\nConsent: ${if (consentBox.isChecked) "Granted" else "Not granted"}"
    }

    override fun onResume() { super.onResume(); if (::statusText.isInitialized) updateStatus() }
}
