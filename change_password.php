<?php
session_start();
if(!isset($_SESSION['user_id'])){
    header("Location: index.php");
    exit();
}

require_once "config.php";

$uid = $_SESSION['user_id'];

if(isset($_POST['current'])){
    $current = $_POST['current'];
    $new = password_hash($_POST['new'], PASSWORD_DEFAULT);

    $stmt = $conn->prepare("SELECT password FROM users WHERE user_id=?");
    $stmt->bind_param("i",$uid);
    $stmt->execute();
    $result = $stmt->get_result()->fetch_assoc();

    if(password_verify($current,$result['password'])){
        $update = $conn->prepare("UPDATE users SET password=? WHERE user_id=?");
        $update->bind_param("si",$new,$uid);
        $update->execute();
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