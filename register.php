<?php

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
<title>Register - TrackWise</title>
<style>
body{
margin:0;
height:100vh;
display:flex;
justify-content:center;
align-items:center;
font-family:Segoe UI;
background:linear-gradient(135deg,#1e3c72,#2a5298);
}

.card{
background:white;
padding:40px;
width:350px;
border-radius:15px;
box-shadow:0 10px 25px rgba(0,0,0,0.3);
}

h2{
text-align:center;
margin-bottom:25px;
color:#1e3c72;
}

input{
width:100%;
padding:12px;
margin-bottom:15px;
border-radius:8px;
border:1px solid #ccc;
outline:none;
transition:0.3s;
}

input:focus{
border-color:#1e3c72;
box-shadow:0 0 5px rgba(30,60,114,0.5);
}

button{
width:100%;
padding:12px;
border:none;
border-radius:8px;
background:#1e3c72;
color:white;
font-size:16px;
cursor:pointer;
transition:0.3s;
}

button:hover{
background:#16325c;
}

.error{
color:red;
text-align:center;
margin-bottom:10px;
}

.login-link{
text-align:center;
margin-top:15px;
}

.login-link a{
text-decoration:none;
color:#1e3c72;
font-weight:bold;
}
</style>
</head>
<body>

<div class="card">
<h2>Create Account</h2>

<?php if(isset($error)) echo "<div class='error'>$error</div>"; ?>

<form method="post">
<input type="text" name="name" placeholder="Full Name" required>
<input type="email" name="email" placeholder="Email Address" required>
<input type="password" name="password" placeholder="Password" required>
<button type="submit">Register</button>
</form>

<div class="login-link">
Already have an account? <a href="index.php">Login</a>
</div>

</div>

</body>
</html>
