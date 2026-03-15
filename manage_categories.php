<?php
session_start();
if(!isset($_SESSION['user_id'])){
    header("Location: index.php");
    exit();
}

require_once "config.php";

/* ADD CATEGORY */
if(isset($_POST['new_category'])){
    $name = trim($_POST['new_category']);
    if($name != ""){
        $stmt = $conn->prepare("INSERT INTO categories (category_name) VALUES (?)");
        $stmt->bind_param("s",$name);
        $stmt->execute();
    }
}

/* UPDATE CATEGORY */
if(isset($_POST['edit_id'])){
    $id = $_POST['edit_id'];
    $name = trim($_POST['edit_name']);
    $stmt = $conn->prepare("UPDATE categories SET category_name=? WHERE category_id=?");
    $stmt->bind_param("si",$name,$id);
    $stmt->execute();
}

if(isset($_GET['delete'])){
    $id = $_GET['delete'];

    // Check if category is used in transactions
    $check = $conn->query("
        SELECT COUNT(*) as total 
        FROM transactions 
        WHERE category_id = $id
    ")->fetch_assoc();

    if($check['total'] > 0){
        echo "<script>alert('Cannot delete. Category is used in transactions.');</script>";
    } else {
        $conn->query("DELETE FROM categories WHERE category_id=$id");
    }
}

$categories = $conn->query("SELECT * FROM categories");
?>

<!DOCTYPE html>
<html>
<head>
<title>Manage Categories</title>
<style>
body{font-family:Segoe UI;background:#f4f6fb;padding:40px;}
.container{width:500px;margin:auto;background:white;padding:25px;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.1);}
input{padding:6px;margin-top:5px;border-radius:5px;border:1px solid #ccc;}
button{padding:6px 10px;margin-top:5px;background:#1e3c72;color:white;border:none;border-radius:5px;cursor:pointer;}
.category-box{margin-bottom:15px;border-bottom:1px solid #ddd;padding-bottom:10px;}
a{color:red;text-decoration:none;margin-left:10px;}
</style>
</head>
<body>

<div class="container">
<h2>Manage Categories</h2>

<!-- ADD NEW -->
<form method="post">
<input type="text" name="new_category" placeholder="New Category Name" required>
<button type="submit">Add Category</button>
</form>

<hr>

<?php while($row=$categories->fetch_assoc()): ?>
<div class="category-box">

<form method="post" style="display:inline;">
<input type="hidden" name="edit_id" value="<?php echo $row['category_id']; ?>">
<input type="text" name="edit_name" value="<?php echo $row['category_name']; ?>" required>
<button type="submit">Update</button>
</form>

<a href="?delete=<?php echo $row['category_id']; ?>" 
onclick="return confirm('Delete this category?')">Delete</a>

</div>
<?php endwhile; ?>

<br>
<a href="dashboard.php">⬅ Back to Dashboard</a>

</div>

</body>
</html>