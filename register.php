<?php
require_once "config.php";

if(isset($_POST['name'])){
    $name     = $_POST['name'];
    $email    = $_POST['email'];
    $password = password_hash($_POST['password'], PASSWORD_DEFAULT);

    $stmt = $conn->prepare("INSERT INTO users(name,email,password) VALUES(?,?,?)");
    $stmt->bind_param("sss", $name, $email, $password);

    if($stmt->execute()){
        header("Location: index.php");
        exit();
    } else {
        $error = "This email is already registered.";
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Finlytics — Register</title>
    <link rel="stylesheet" href="style.css">
</head>
<body class="auth-page">

<div class="box">
    <h2>Create Account</h2>
    <?php if(isset($error)): ?>
        <div class="error-msg"><?php echo htmlspecialchars($error); ?></div>
    <?php endif; ?>
    <form method="post">
        <input type="text"     name="name"     placeholder="Full Name"       required>
        <input type="email"    name="email"    placeholder="Email Address"   required>
        <input type="password" name="password" placeholder="Password"        required>
        <button type="submit">Create Account</button>
    </form>
    <p>Already have an account? <a href="index.php">Login</a></p>
</div>

</body>
</html>