<?php
session_start();
require_once "config.php";

if(isset($_POST['email'])){

    $email = trim($_POST['email']);
    $password = $_POST['password'];

    $stmt = $conn->prepare("SELECT user_id, password FROM users WHERE email=?");
    $stmt->bind_param("s",$email);
    $stmt->execute();
    $result = $stmt->get_result();

    if($result->num_rows === 1){

        $user = $result->fetch_assoc();

        if(password_verify($password, $user['password'])){

            // 🔐 VERY IMPORTANT SECURITY LINE
            session_regenerate_id(true);

            $_SESSION['user_id'] = $user['user_id'];

            header("Location: dashboard.php");
            exit();

        } else {
            echo "Invalid email or password";
        }

    } else {
        echo "Invalid email or password";
    }
}
?>