<?php
session_start();
$conn = new mysqli("localhost","root","","trackwise");

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
?>