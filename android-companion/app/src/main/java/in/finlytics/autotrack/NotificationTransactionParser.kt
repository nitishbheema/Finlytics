package in.finlytics.autotrack

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object NotificationTransactionParser {
    private val amountRegex = Regex("(?:₹|INR\\s*|Rs\\.?\\s*)([0-9][0-9,]*(?:\\.[0-9]{1,2})?)", RegexOption.IGNORE_CASE)
    private val referenceRegex = Regex("(?:UPI\\s*(?:REF(?:ERENCE)?|TXN(?:\\s*ID)?|RRN)|RRN|UTR)\\s*(?:NO\\.?|NUMBER)?\\s*[:#-]?\\s*([A-Z0-9]{8,24})", RegexOption.IGNORE_CASE)
    private val debitRegex = Regex("\\b(paid|sent|debited|deducted|transferred|payment to)\\b", RegexOption.IGNORE_CASE)
    private val creditRegex = Regex("\\b(received|credited|deposited|refund|cashback)\\b", RegexOption.IGNORE_CASE)

    data class Parsed(
        val amount: Double,
        val direction: String,
        val merchant: String,
        val reference: String?,
        val transactionDate: String,
        val occurredAt: String,
    )

    fun parse(text: String, postedAtMillis: Long): Parsed? {
        // The text exists only in memory during parsing; callers must never persist or upload it.
        if (text.length > 4000) return null
        val normalized = text.replace('\n', ' ').replace(Regex("\\s+"), " ").trim()
        val lower = normalized.lowercase(Locale.ROOT)
        if (!(lower.contains("upi") || lower.contains("payment") || lower.contains("bank") || lower.contains("account"))) return null
        val amountMatch = amountRegex.find(normalized) ?: return null
        val amount = amountMatch.groupValues[1].replace(",", "").toDoubleOrNull() ?: return null
        if (amount <= 0.0 || amount > 999999999999.99) return null

        val isCredit = creditRegex.containsMatchIn(normalized)
        val isDebit = debitRegex.containsMatchIn(normalized)
        if (isCredit == isDebit) return null // ambiguous/no direction: leave it out rather than guessing
        val direction = if (isDebit) "debit" else "credit"

        val counterpartyPattern = if (direction == "debit") {
            Regex("\\bto\\s+([^.;|]{2,90})", RegexOption.IGNORE_CASE)
        } else {
            Regex("\\bfrom\\s+([^.;|]{2,90})", RegexOption.IGNORE_CASE)
        }
        val merchant = counterpartyPattern.find(normalized)?.groupValues?.get(1)
            ?.replace(Regex("\\b(via|using|through|upi|ref(?:erence)?|utr|rrn|txn|transaction|account|a/c)\\b.*$", RegexOption.IGNORE_CASE), "")
            ?.trim()?.take(180).orEmpty().ifBlank { "UPI transaction" }
        val reference = referenceRegex.find(normalized)?.groupValues?.get(1)?.uppercase(Locale.ROOT)

        val instant = Date(postedAtMillis)
        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getDefault() }
        val timestampFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
        return Parsed(amount, direction, merchant, reference, dateFormat.format(instant), timestampFormat.format(instant))
    }
}
