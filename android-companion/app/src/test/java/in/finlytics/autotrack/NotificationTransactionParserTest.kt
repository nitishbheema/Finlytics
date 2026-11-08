package in.finlytics.autotrack

import org.junit.Assert.*
import org.junit.Test

class NotificationTransactionParserTest {
    @Test fun parsesDebitWithReference() {
        val result = NotificationTransactionParser.parse(
            "You paid ₹250.50 to Amazon via UPI. UPI Ref: 123456789012",
            1794133812000L
        )
        assertNotNull(result)
        assertEquals("debit", result!!.direction)
        assertEquals(250.50, result.amount, 0.001)
        assertEquals("Amazon", result.merchant)
        assertEquals("123456789012", result.reference)
    }

    @Test fun parsesCreditWithReference() {
        val result = NotificationTransactionParser.parse(
            "₹400 received from Rahul via UPI. UPI Ref: 987654321012",
            1794133812000L
        )
        assertNotNull(result)
        assertEquals("credit", result!!.direction)
        assertEquals("Rahul", result.merchant)
    }

    @Test fun ignoresAmbiguousNotifications() {
        assertNull(NotificationTransactionParser.parse("Payment update: ₹200", 1794133812000L))
        assertNull(NotificationTransactionParser.parse("You paid ₹200 and received ₹100 via UPI", 1794133812000L))
    }
}
