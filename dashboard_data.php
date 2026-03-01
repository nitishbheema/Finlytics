<?php
session_start();
$conn = new mysqli(
    $_ENV['MYSQLHOST'],
    $_ENV['MYSQLUSER'],
    $_ENV['MYSQLPASSWORD'],
    $_ENV['MYSQLDATABASE'],
    $_ENV['MYSQLPORT']
);
$uid = $_SESSION['user_id'];

$userData = $conn->query("SELECT budget FROM users WHERE user_id=$uid")->fetch_assoc();
$budget = $userData['budget'];

$total = $conn->query("SELECT SUM(amount) t FROM expenses WHERE user_id=$uid")->fetch_assoc()['t'] ?? 0;
$remaining = max($budget - $total, 0);

echo json_encode([
"total"=>$total,
"remaining"=>$remaining
]);
