<?php
require_once "config.php";

if(isset($_POST['name'])){
    $name = $_POST['name'];
    $email = $_POST['email'];
    $password = password_hash($_POST['password'], PASSWORD_DEFAULT);

    $stmt = $conn->prepare("INSERT INTO users(name,email,password) VALUES(?,?,?)");
    $stmt->bind_param("sss",$name,$email,$password);

    if($stmt->execute()){
        header("Location: index.php");
        exit();
    } else {
        $error = "Email already exists";
    }
}
?>
<!DOCTYPE html>
<html>
<head>
<title>Register - Finlytics</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div class="box">
<h2>Create Account</h2>
<?php if(isset($error)) echo "<div style='color:red'>$error</div>"; ?>
<form method="post">
<input type="text" name="name" placeholder="Full Name" required>
<input type="email" name="email" placeholder="Email Address" required>
<input type="password" name="password" placeholder="Password" required>
<button type="submit">Register</button>
</form>
<p><a href="index.php">Back to Login</a></p>
</div>
</body>
</html>