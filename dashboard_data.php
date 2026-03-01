<?php
session_start();
<<<<<<< HEAD
$conn = new mysqli("localhost","root","","trackwise");
=======
$host = "yamabiko.proxy.rlwy.net";
$user = "root";
$password = "FUVTxyveCjKHaUUpSElYSrzgWWPEyokT";
$database = "railway";
$port = 15951;

$conn = new mysqli(
    getenv("MYSQLHOST"),
    getenv("MYSQLUSER"),
    getenv("MYSQLPASSWORD"),
    getenv("MYSQLDATABASE"),
    getenv("MYSQLPORT")
);

if ($conn->connect_error) {
    die("Database Connection Failed: " . $conn->connect_error);
}
>>>>>>> 9b882ed74f9466c70673c856716a8dfa26f3f5c6
$uid = $_SESSION['user_id'];

$userData = $conn->query("SELECT budget FROM users WHERE user_id=$uid")->fetch_assoc();
$budget = $userData['budget'];

$total = $conn->query("SELECT SUM(amount) t FROM expenses WHERE user_id=$uid")->fetch_assoc()['t'] ?? 0;
$remaining = max($budget - $total, 0);

echo json_encode([
"total"=>$total,
"remaining"=>$remaining
<<<<<<< HEAD
]);
=======
]);
>>>>>>> 9b882ed74f9466c70673c856716a8dfa26f3f5c6
