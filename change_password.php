<?php
session_start();
if(!isset($_SESSION['user_id'])){
    header("Location: index.php");
    exit();
}

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
$uid = $_SESSION['user_id'];

if(isset($_POST['current'])){
    $current = $_POST['current'];
    $new = password_hash($_POST['new'], PASSWORD_DEFAULT);

    $user = $conn->query("SELECT password FROM users WHERE user_id=$uid")->fetch_assoc();

    if(password_verify($current,$user['password'])){
        $stmt = $conn->prepare("UPDATE users SET password=? WHERE user_id=?");
        $stmt->bind_param("si",$new,$uid);
        $stmt->execute();
        echo "Password Updated";
    } else {
        echo "Current Password Incorrect";
    }
}
?>
<!DOCTYPE html>
<html>
<head><title>Change Password</title></head>
<body>
<h2>Change Password</h2>
<form method="post">
<input type="password" name="current" placeholder="Current Password" required>
<input type="password" name="new" placeholder="New Password" required>
<button type="submit">Update Password</button>
</form>
</body>
</html>
