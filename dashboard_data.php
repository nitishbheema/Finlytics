<?php
session_start();
$host = "yamabiko.proxy.rlwy.net";
$user = "root";
$password = "FUVTxyveCjKHaUUpSElYSrzgWWPEyokT";
$database = "railway";
$port = 15951;

$conn = new mysqli($host, $user, $password, $database, $port);

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}
$uid = $_SESSION['user_id'];

$userData = $conn->query("SELECT budget FROM users WHERE user_id=$uid")->fetch_assoc();
$budget = $userData['budget'];

$total = $conn->query("SELECT SUM(amount) t FROM expenses WHERE user_id=$uid")->fetch_assoc()['t'] ?? 0;
$remaining = max($budget - $total, 0);

echo json_encode([
"total"=>$total,
"remaining"=>$remaining
]);
