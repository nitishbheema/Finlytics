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
if(isset($_POST['email'])){
    $email = $_POST['email'];
    $password = $_POST['password'];

    $stmt = $conn->prepare("SELECT * FROM users WHERE email=?");
    $stmt->bind_param("s",$email);
    $stmt->execute();
    $result = $stmt->get_result();

    if($result->num_rows==1){
        $user = $result->fetch_assoc();

        if(password_verify($password, $user['password'])){
            $_SESSION['user_id']=$user['user_id'];
            header("Location: dashboard.php");
            exit();
        } else {
            echo "Wrong Password";
        }
    } else {
        echo "User not found";
    }
}
<<<<<<< HEAD
?>
=======
?>
>>>>>>> 9b882ed74f9466c70673c856716a8dfa26f3f5c6
