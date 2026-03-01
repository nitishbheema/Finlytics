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

$conn = new mysqli($host, $user, $password, $database, $port);

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}
$uid = $_SESSION['user_id'];

if(isset($_POST['update_profile'])){
    $name = $_POST['name'];
    $budget = $_POST['budget'];

    if(!empty($_FILES['photo']['name'])){
        $photoName = time()."_".$_FILES['photo']['name'];
        move_uploaded_file($_FILES['photo']['tmp_name'], "uploads/".$photoName);

        $stmt = $conn->prepare("UPDATE users SET name=?, budget=?, photo=? WHERE user_id=?");
        $stmt->bind_param("sdsi",$name,$budget,$photoName,$uid);
    } else {
        $stmt = $conn->prepare("UPDATE users SET name=?, budget=? WHERE user_id=?");
        $stmt->bind_param("sdi",$name,$budget,$uid);
    }

    $stmt->execute();
}

$user = $conn->query("SELECT * FROM users WHERE user_id=$uid")->fetch_assoc();
?>

<!DOCTYPE html>
<html>
<head>
<title>User Profile</title>

<style>
body{
margin:0;
font-family:Segoe UI;
background:#f4f6fb;
}

.sidebar{
width:220px;
height:100vh;
background:#1e3c72;
color:white;
position:fixed;
padding:20px;
}

.sidebar a{
display:block;
color:white;
text-decoration:none;
margin:15px 0;
}

.sidebar a:hover{
opacity:0.7;
}

.main{
margin-left:240px;
padding:40px;
}

.profile-card{
background:white;
width:500px;
padding:30px;
border-radius:12px;
box-shadow:0 10px 25px rgba(0,0,0,0.1);
}

.profile-header{
text-align:center;
margin-bottom:20px;
}

.profile-header img{
width:130px;
height:130px;
border-radius:50%;
object-fit:cover;
border:4px solid #1e3c72;
}

input,button{
width:100%;
padding:10px;
margin-top:15px;
border-radius:6px;
border:1px solid #ccc;
}

button{
background:#1e3c72;
color:white;
border:none;
cursor:pointer;
}

button:hover{
background:#2a5298;
}

.readonly{
background:#eee;
}

.section-title{
margin-top:20px;
font-weight:bold;
color:#1e3c72;
}
</style>
</head>

<body>

<div class="sidebar">
<h2>TrackWise</h2>
<a href="dashboard.php">Dashboard</a>
<a href="add_expense.php">Add Expense</a>
<a href="profile.php">Profile</a>
<a href="change_password.php">Change Password</a>
<a href="export_pdf.php" target="_blank">Export PDF</a>
<a href="logout.php">Logout</a>
</div>

<div class="main">

<div class="profile-card">

<div class="profile-header">
<?php if($user['photo']): ?>
<img src="uploads/<?php echo $user['photo']; ?>">
<?php else: ?>
<img src="https://via.placeholder.com/130">
<?php endif; ?>
<h2><?php echo $user['name']; ?></h2>
</div>

<form method="post" enctype="multipart/form-data">

<div class="section-title">Basic Information</div>

<label>Name</label>
<input type="text" name="name" value="<?php echo $user['name']; ?>" required>

<label>Email</label>
<input type="email" value="<?php echo $user['email']; ?>" class="readonly" readonly>

<label>Monthly Budget (₹)</label>
<input type="number" name="budget" value="<?php echo $user['budget']; ?>" required>

<label>Profile Photo</label>
<input type="file" name="photo">

<button type="submit" name="update_profile">Update Profile</button>

</form>

</div>

</div>

</body>
</html>
