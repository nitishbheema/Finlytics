<?php
session_start();
if(!isset($_SESSION['user_id'])){
    header("Location: index.php");
    exit();
}
require_once "config.php";
$uid = $_SESSION['user_id'];

$saveMsg = "";

if(isset($_POST['update_profile'])){
    $name   = $_POST['name'];
    $budget = $_POST['budget'];

    if(!empty($_FILES['photo']['name'])){
        $allowed = ['jpg','jpeg','png','gif','webp'];
        $ext     = strtolower(pathinfo($_FILES['photo']['name'], PATHINFO_EXTENSION));

        if(in_array($ext, $allowed)){
            $photoName = time()."_".$_FILES['photo']['name'];
            move_uploaded_file($_FILES['photo']['tmp_name'], "uploads/".$photoName);

            $stmt = $conn->prepare("UPDATE users SET name=?, budget=?, photo=? WHERE user_id=?");
            $stmt->bind_param("sdsi", $name, $budget, $photoName, $uid);
        } else {
            $saveMsg = "❌ Invalid file type. Use JPG, PNG, GIF or WebP.";
        }
    } else {
        $stmt = $conn->prepare("UPDATE users SET name=?, budget=? WHERE user_id=?");
        $stmt->bind_param("sdi", $name, $budget, $uid);
    }

    if(empty($saveMsg)){
        $stmt->execute();
        $saveMsg = "✅ Profile updated successfully!";
    }
}

$user = $conn->query("SELECT * FROM users WHERE user_id=$uid")->fetch_assoc();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Profile — TrackWise</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>

<?php include 'sidebar.php'; ?>

<div class="main">

    <div class="page-header">
        <h2>👤 My Profile</h2>
        <a href="dashboard.php" class="btn-back">⬅ Dashboard</a>
    </div>

    <?php if($saveMsg): ?>
        <div class="alert <?php echo strpos($saveMsg,'✅') !== false ? 'alert-success' : 'alert-danger'; ?>">
            <?php echo $saveMsg; ?>
        </div>
    <?php endif; ?>

    <div class="form-card" style="max-width:520px;">

        <!-- PROFILE PHOTO -->
        <div class="profile-photo-wrap">
            <?php if(!empty($user['photo'])): ?>
                <img src="uploads/<?php echo htmlspecialchars($user['photo']); ?>" alt="Profile Photo">
            <?php else: ?>
                <img src="https://ui-avatars.com/api/?name=<?php echo urlencode($user['name']); ?>&size=110&background=1e3c72&color=fff&rounded=true" alt="Avatar">
            <?php endif; ?>
            <h3><?php echo htmlspecialchars($user['name']); ?></h3>
            <span><?php echo htmlspecialchars($user['email']); ?></span>
        </div>

        <form method="post" enctype="multipart/form-data">

            <div style="border-top:1px solid var(--border); padding-top:20px; margin-top:10px;">
                <label>Full Name</label>
                <input type="text" name="name"
                    value="<?php echo htmlspecialchars($user['name']); ?>" required>

                <label>Email Address</label>
                <input type="email"
                    value="<?php echo htmlspecialchars($user['email']); ?>"
                    readonly style="background:var(--bg); cursor:not-allowed; opacity:0.7;">

                <label>Monthly Budget (₹)</label>
                <input type="number" name="budget"
                    value="<?php echo $user['budget']; ?>" required>

                <label>Profile Photo</label>
                <input type="file" name="photo" accept="image/*">
                <p class="text-muted" style="margin-top:5px;">Leave empty to keep current photo. JPG, PNG, GIF, WebP.</p>
            </div>

            <button type="submit" name="update_profile" class="btn btn-primary">
                💾 Update Profile
            </button>
        </form>

        <div style="margin-top:16px; text-align:center;">
            <a href="change_password.php" style="color:var(--primary); font-size:13.5px; font-weight:500;">
                🔒 Change Password
            </a>
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
</script>

</body>
</html>