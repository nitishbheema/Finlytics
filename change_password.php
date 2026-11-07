<?php
session_start();
if(!isset($_SESSION['user_id'])){
    header("Location: index.php");
    exit();
}
require_once "config.php";
$uid = $_SESSION['user_id'];

$message     = "";
$messageType = "";

if(isset($_POST['current'])){
    $current = $_POST['current'];
    $new     = $_POST['new'];
    $confirm = $_POST['confirm'];

    if($new !== $confirm){
        $message     = "❌ New passwords do not match.";
        $messageType = "danger";
    } elseif(strlen($new) < 6){
        $message     = "❌ Password must be at least 6 characters.";
        $messageType = "danger";
    } else {
        $stmt = $conn->prepare("SELECT password FROM users WHERE user_id=?");
        $stmt->bind_param("i", $uid);
        $stmt->execute();
        $result = $stmt->get_result()->fetch_assoc();

        if(password_verify($current, $result['password'])){
            $hashed = password_hash($new, PASSWORD_DEFAULT);
            $update = $conn->prepare("UPDATE users SET password=? WHERE user_id=?");
            $update->bind_param("si", $hashed, $uid);
            $update->execute();
            $message     = "✅ Password updated successfully!";
            $messageType = "success";
        } else {
            $message     = "❌ Current password is incorrect.";
            $messageType = "danger";
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Change Password — Finlytics</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>

<?php include 'sidebar.php'; ?>

<div class="main">

    <div class="page-header">
        <h2>🔒 Change Password</h2>
        <a href="profile.php" class="btn-back">⬅ Back to Profile</a>
    </div>

    <?php if($message): ?>
        <div class="alert alert-<?php echo $messageType; ?>"><?php echo $message; ?></div>
    <?php endif; ?>

    <div class="form-card">
        <h3>Update Your Password</h3>

        <form method="post">
            <label>Current Password</label>
            <input type="password" name="current" placeholder="Enter your current password" required>

            <label>New Password</label>
            <input type="password" name="new" id="new_pass" placeholder="At least 6 characters" required>

            <label>Confirm New Password</label>
            <input type="password" name="confirm" id="confirm_pass" placeholder="Repeat new password" required
                oninput="checkMatch()">

            <div id="match_msg" style="font-size:12.5px; margin-top:6px; display:none;"></div>

            <button type="submit" class="btn btn-primary">🔐 Update Password</button>
        </form>

        <div style="margin-top:18px; padding-top:16px; border-top:1px solid var(--border);">
            <p class="text-muted" style="font-size:12.5px;">
                💡 Use a strong password with at least 6 characters, mixing letters and numbers.
            </p>
        </div>
    </div>

</div>

<script>
function toggleDark(){
    document.body.classList.toggle('light');
    var isLight = document.body.classList.contains('light');
    localStorage.setItem('lightMode', isLight);
    var icon  = document.getElementById('themeIcon');
    var label = document.getElementById('themeLabel');
    if(icon)  icon.textContent  = isLight ? '🌙' : '☀️';
    if(label) label.textContent = isLight ? 'Dark Mode' : 'Light Mode';
}
(function(){
    var isLight = localStorage.getItem('lightMode') === 'true';
    if(isLight) document.body.classList.add('light');
    var icon  = document.getElementById('themeIcon');
    var label = document.getElementById('themeLabel');
    if(icon)  icon.textContent  = isLight ? '🌙' : '☀️';
    if(label) label.textContent = isLight ? 'Dark Mode' : 'Light Mode';
})();

function checkMatch(){
    var np  = document.getElementById('new_pass').value;
    var cp  = document.getElementById('confirm_pass').value;
    var msg = document.getElementById('match_msg');
    if(cp.length === 0){ msg.style.display = 'none'; return; }
    msg.style.display = 'block';
    if(np === cp){
        msg.style.color = 'var(--success)';
        msg.textContent = '✅ Passwords match';
    } else {
        msg.style.color = 'var(--danger)';
        msg.textContent = '❌ Passwords do not match';
    }
}
</script>

</body>
</html>